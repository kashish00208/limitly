import RepoScannerTool from "./tools/repo-scanner";
import IssueScorerTool from "./tools/issue-scorer";
import HealthIndexerTool from "./tools/health-indexer";
import StarterPlanTool from "./tools/starter-plan";
import {type AgentResponse } from "./types/agent-response";
import {type UserProfile } from "./types/user-profile";
import { repoVerdictPrompt } from "./prompts/repo-verdict.prompt";

// Agent Initialization 

export async function initAgent() {
  const repoScanner = new RepoScannerTool();   
  const issueScorer = new IssueScorerTool();  
  const healthIndexer = new HealthIndexerTool(); 
  const starterPlan = new StarterPlanTool();   // Generate walkthrough

  return { repoScanner, issueScorer, healthIndexer, starterPlan };
}


export async function runAgent(
  repoUrl: string,
  userProfile: UserProfile
): Promise<AgentResponse> {

  const { repoScanner, issueScorer, healthIndexer, starterPlan } = 
    await initAgent();

  // Step 1: Fetch repo issues + health via MCP/GitLab
  const { issues, repoHealth } = await repoScanner.run(repoUrl);

  // Step 2: Index health metrics (merge time, maintainer response)
  const healthScore = await healthIndexer.run(repoUrl);

  // Step 3: Score each issue against user profile (skills, time, goal)
  const scoredIssues = await issueScorer.run(issues, userProfile );

  // Step 4: Generate step-by-step starter plan for top issue
  const topIssue = scoredIssues[0];
  const plan = await starterPlan.run(topIssue, userProfile);

  const verdict = repoVerdictPrompt(repoHealth, healthScore);
  const { avgMergetimeHors, ...restRepoHealth } = repoHealth as any;
  const avgMergeTimeHours = Array.isArray(avgMergetimeHors)
    ? avgMergetimeHors.reduce((sum, value) => sum + value, 0) / (avgMergetimeHors.length || 1)
    : avgMergetimeHors;

  const combinedRepoHealth = {
    ...restRepoHealth,
    ...healthScore,
    ...(avgMergeTimeHours !== undefined ? { avgMergeTimeHours } : {}),
    verdict,
  };

  return {
    verdict,
    issues: scoredIssues.slice(0, 5),
    starterPlan: plan,
    repoHealth: combinedRepoHealth,
  };
}

// Google Cloud Agent Builder Handle

export async function agentHandler(req: any, res: any) {
  try {
    const { repoUrl, userProfile } = req.body;

    if (!repoUrl || !userProfile) {
      return res.status(400).json({ error: 'repoUrl and userProfile required' });
    }

    const result = await runAgent(repoUrl, userProfile);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[Agent Error]', err);
    return res.status(500).json({ error: 'Agent failed', details: err });
  }
}
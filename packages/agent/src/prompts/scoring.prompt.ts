export const scoringPrompt = `You are an expert scoring assistant.

Given an issue description, return a numeric score from 0 to 100 representing how well the issue matches the target criteria.

Output only a JSON object with the following shape:
{
  "score": number,
  "reason": string
}

Do not include any additional text or markdown.

Issue description:
{issue}
`;
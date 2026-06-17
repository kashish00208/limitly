import express from 'express'
const app = express();
import { agentHandler } from '.';
app.use()
app.use(express.json)

app.post("/agent/init",agentHandler)

app.listen(8080,()=>{
    console.log("Server is running on port 8080")
})
import express, { Request, Response } from "express";
const app = express();
import Bucket from "../helper/rateLimiter";
import { connectRedis } from "../helper/redis";

app.get("/", (req: Request, res: Response) => {
    res.send("Hello world")
});

const tokenBucket = new Bucket(10,2)
const rateLimitingMiddleWare = (req:Request,res:Response,next:express.NextFunction)=>{
    if(tokenBucket.allowRequest()){
        next()
    }else{
        res.status(429).send('Too many requests Please try again later ')
    }
}

await connectRedis()
app.use(rateLimitingMiddleWare)

//Endpoint that return allow or deny based on token bucket algortthm throught client key

app.listen(8080,()=>{
    console.log (`Server is running on http://localhost:8080}`)
})
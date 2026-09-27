import express, { Request, Response } from "express";
const app = express();

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

app.use(rateLimitingMiddleWare)

app.listen(8080,()=>{
    console.log (`Server is running on http://localhost:8080}`)
})
import express, { Request, Response } from "express";
import { rateLimiter } from "../helper/rateLimiter";
import { connectRedis } from "../helper/redis";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world");
});

async function main() {
    await connectRedis();

    app.listen(8080,()=>{
        console.log("Server is running on PORT 8080")
    })
}

main()
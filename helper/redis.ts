import { createClient} from "redis";

const client = createClient();

client.on('error',err=>{
    console.log("Redis client connection failed",err)
});

await client.connect()
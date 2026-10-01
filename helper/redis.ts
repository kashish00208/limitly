import { createClient} from "redis";

export const client = createClient();

client.on('error',err=>{
    console.log("Redis client connection Eroror ",err)
});

export async function connectRedis() {
    await client.connect()
}


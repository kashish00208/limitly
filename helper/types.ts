interface tokenBucket {
  capacity: number;
  tokens: number;
  refilrate: number;
  lastRefileTime: Date;
}

interface User {
  id:number;
  TotalReq:number;
  remainingReq:number;
  choseAlgo:["TOkenBucket","FixedLimit"]
}
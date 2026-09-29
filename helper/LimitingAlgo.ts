class Bucket {
    private capacity :number;
    private tokens :number;
    private refilRate:number;
    private lastRefilTime:number;

    constructor(capacity:number,refilRate:number){
        this.capacity = capacity;
        this.refilRate = refilRate;
        this.tokens = capacity;
        this.lastRefilTime = Date.now();
    }

    private addTokens(){
        const now = Date.now();
        const elasped = (now - this.lastRefilTime)/1000;
        const newTokens = elasped*this.refilRate;
        this.tokens = Math.min(this.capacity,this.tokens+newTokens);
        this.lastRefilTime = now;
    }
    public allowRequest():Boolean{
        this.addTokens();
        if(this.tokens>0){
            this.tokens--;
            return true;
        }
        return false;
    }

}

export default Bucket;
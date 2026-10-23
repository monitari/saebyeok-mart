// Web Locks provide an atomic writer lease across tabs on this origin.
export class WriterLease {
  constructor(locks=globalThis.navigator?.locks){this.locks=locks;this.owned=false;this.releaseLock=null;}
  async acquire(){
    if(this.owned)return true;
    if(!this.locks)return false;
    return new Promise(resolve=>{
      this.task=this.locks.request('saebyeok-mart-writer',{ifAvailable:true},async lock=>{
        this.owned=!!lock;resolve(this.owned);
        if(lock)await new Promise(done=>{this.releaseLock=done;});
        this.owned=false;
      }).catch(()=>resolve(false));
    });
  }
  release(){this.releaseLock?.();this.releaseLock=null;this.owned=false;}
}

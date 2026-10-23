// Small synthesized shop sounds; no audio downloads or autoplay on first visit.
export class ShopSound {
  constructor(){this.ctx=null;this.muted=true;this.ambient=.35;this.effects=.55;this.lastDoor=0;this.people=new Set();this.microwave=false;this.prev={};}
  async enable(on){
    if(!on){this.muted=true;this.ctx?.suspend();return;}
    const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Audio)throw new Error('이 브라우저는 소리를 지원하지 않아요.');
    if(!this.ctx){
      this.ctx=new Audio();const c=this.ctx;
      this.rainGain=c.createGain();this.rainGain.gain.value=0;this.rainGain.connect(c.destination);
      const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.25;
      const rain=c.createBufferSource(),filter=c.createBiquadFilter();rain.buffer=buffer;rain.loop=true;filter.type='lowpass';filter.frequency.value=1500;rain.connect(filter);filter.connect(this.rainGain);rain.start();
      this.humGain=c.createGain();this.humGain.gain.value=0;this.humGain.connect(c.destination);
      const hum=c.createOscillator();hum.frequency.value=60;hum.connect(this.humGain);hum.start();
    }
    await this.ctx.resume();this.muted=false;
  }
  tone(frequency,delay,duration,volume=.08){
    if(this.muted||this.ctx?.state!=='running')return;
    const c=this.ctx,osc=c.createOscillator(),gain=c.createGain(),at=c.currentTime+delay;
    osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*this.effects),at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(c.destination);osc.start(at);osc.stop(at+duration+.05);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  update(s,quiet=false){
    const present=new Set(Object.values(s.actors).filter(a=>a.role==='customer'&&a.flags.entered).map(a=>a.id));
    const microwave=!!s.appliances.microwave.by&&s.elapsed<s.appliances.microwave.until;
    if(this.ctx){
      const volume=this.muted||quiet?0:this.ambient;
      this.rainGain.gain.setTargetAtTime(['rain','storm'].includes(s.weather.kind)?volume*.2:0,this.ctx.currentTime,.5);
      this.humGain.gain.setTargetAtTime(volume*.008,this.ctx.currentTime,.5);
      if(!quiet&&this.ctx.state==='running'){
        const now=this.ctx.currentTime;
        if([...present].some(id=>!this.people.has(id))&&now-this.lastDoor>1){this.tone(784,0,.35);this.tone(659,.2,.45);this.lastDoor=now;}
        if(this.microwave&&!microwave){this.tone(1046,0,.13,.05);this.tone(1046,.22,.13,.05);}
      }
    }
    // Equipment sounds play once when something starts.
    if(!quiet&&this.ctx?.state==='running'&&s.interior){
      const x=s.interior,now={coffee:x.coffee.by,atm:x.atm.by,kiosk:x.kiosk.by,error:x.kiosk.error,checkout:s.checkout?.id,truck:x.truck?.kind};
      if(now.coffee&&now.coffee!==this.prev.coffee)for(let i=0;i<4;i++)this.tone(150+i*12,i*.09,.08,.05);
      if(now.atm&&now.atm!==this.prev.atm)for(let i=0;i<3;i++)this.tone(1200,i*.18,.07,.035);
      if(now.kiosk&&now.kiosk!==this.prev.kiosk)this.tone(1500,0,.09,.04);
      if(now.error&&!this.prev.error){this.tone(330,0,.25,.05);this.tone(262,.3,.3,.05);}
      if(now.checkout&&now.checkout!==this.prev.checkout)this.tone(1800,.1,.05,.03);
      if(now.truck&&now.truck!==this.prev.truck)this.tone(70,0,1.2,.06);
      this.prev=now;
    }
    this.people=present;this.microwave=microwave;
  }
}

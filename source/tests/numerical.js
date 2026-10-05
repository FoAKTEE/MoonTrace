() => {
      const M=Moontrace;let seed=92837,cases=0,geoCases=0,maxError=0;
      const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
      const near=(a,b,epsilon=1e-9)=>{if(Math.abs(a-b)>epsilon)throw Error(`Expected ${a} ≈ ${b}`);maxError=Math.max(maxError,Math.abs(a-b));};
      for(let n=5;n<=30;n++)for(let k=0;k<=n;k++){
        const probs=M.cardinalityMarginals(Array(n).fill(0),k);near(probs.reduce((a,b)=>a+b,0),k);probs.forEach(v=>near(v,k/n));cases++;
      }
      for(let run=0;run<200;run++){
        const n=5+Math.floor(rand()*4),k=Math.floor(rand()*(n+1)),scores=Array.from({length:n},()=>rand()*8-4);
        const got=M.cardinalityMarginals(scores,k);let z=0,expected=Array(n).fill(0);
        for(let mask=0;mask<(1<<n);mask++){
          let count=0,score=0;for(let i=0;i<n;i++)if(mask>>i&1){count++;score+=scores[i];}
          if(count!==k)continue;const w=Math.exp(score);z+=w;for(let i=0;i<n;i++)if(mask>>i&1)expected[i]+=w;
        }expected.forEach((v,i)=>near(v/z,got[i]));near(got.reduce((a,b)=>a+b,0),k);cases++;
      }
      for(let run=0;run<100;run++){
        const s=M.newState(12,4);s.players[0].fixed='wolf';s.players[1].fixed='good';s.players[2].alive=false;
        s.events=Array.from({length:12},(_,i)=>({id:'e'+i,speaker:i+1,text:'',round:1,phase:'day',relations:[{id:'r'+i,from:i+1,to:(i+1)%12+1,type:rand()>.5?'suspect':'trust',label:'',strength:rand()}]}));
        const v=M.infer(s);near(v.ps[0],1);near(v.ps[1],0);near(v.sum,4);cases++;
      }
      const s=M.newState(8,3),ev={id:'test',speaker:1,text:'我怀疑6号',round:1,phase:'day',relations:[{id:'r',from:1,to:6,type:'suspect',label:'怀疑',strength:.85}]};
      s.events=[ev];const first=M.infer(s);s.events.push({...ev,id:'repeat'});const repeated=M.infer(s);first.ps.forEach((v,i)=>near(v,repeated.ps[i]));cases++;
      s.players[0].fixed='wolf';const muted=M.infer(s);s.events=[];M.infer(s).ps.forEach((v,i)=>near(v,muted.ps[i]));cases++;
      const death=M.newState(12,4);death.players[4].alive=false;const di=M.infer(death);near(di.ps[4],1/3);near(di.sum,4);near(di.expectedAlive,11/3);cases++;
      for(let run=0;run<1000;run++){
        const a=rand()*Math.PI*2,b=rand()*Math.PI*2,rho=.2+rand()*.7;
        const p={x:rho*Math.cos(a),y:rho*Math.sin(a)},q={x:rho*Math.cos(b),y:rho*Math.sin(b)},g=M.geodesic(p,q,1);
        near(g.point(0).x,p.x,1e-6);near(g.point(0).y,p.y,1e-6);near(g.point(1).x,q.x,1e-6);near(g.point(1).y,q.y,1e-6);
        if(g.kind==='arc')near(g.c.x*g.c.x+g.c.y*g.c.y-g.radius*g.radius,1,1e-5);
        for(let i=0;i<=10;i++){const pt=g.point(i/10);if(Math.hypot(pt.x,pt.y)>1+1e-7)throw Error('Geodesic exited disk');}
        geoCases++;
      }
      if(M.geodesic({x:.8,y:0},{x:-.8,y:0}).kind!=='line')throw Error('Diameter handling');
      const has=(text,expected)=>{
        const got=M.parseSpeech(text,1,16).relations.map(r=>`${r.from}>${r.to}:${r.type}`).sort();
        if(JSON.stringify(got)!==JSON.stringify(expected.sort()))throw Error(text+' => '+got);
      };
      has('我怀疑6号，4号是好人，今天投6号。',['1>6:suspect','1>4:trust']);
      has('4、6都是狼，8号是好人。',['1>4:suspect','1>6:suspect','1>8:trust']);
      has('7，8，9是狼',['1>7:suspect','1>8:suspect','1>9:suspect']);
      has('我不觉得6号是狼',[]);has('我不怀疑6号',[]);has('2号说9号是狼',[]);has('他说6号是狼',[]);
      has('4、6有一狼',[]);has('不保6号',[]);has('6号比8号更像狼',[]);has('如果6号是狼',[]);
      has('4号投了16号',['4>16:vote']);has('六号是狼',['1>6:suspect']);has('我是预言家',[]);
      has('2号金水，6号查杀',['1>2:checkG','1>6:checkW']);
      return {cardinality_and_evidence_cases:cases,geometry_cases:geoCases+1,parser_cases:15,max_absolute_error:maxError};
    }
'use client';
import {useRef,useState, type FormEvent} from 'react';
type Row={id:string;name?:string;title?:string};
type Message={role:string;content:string};
export default function Page(){
  const [token,T]=useState(''),[ready,R]=useState(false),[cards,C]=useState<Row[]>([]),[sessions,S]=useState<Row[]>([]);
  const [card,K]=useState(''),[sid,I]=useState(''),[messages,M]=useState<Message[]>([]),[facts,F]=useState<string[]>([]);
  const [input,V]=useState(''),[partial,P]=useState(''),[error,E]=useState(''),[busy,B]=useState(false);
  const pending=useRef<{sid:string;text:string;id:string}|null>(null);
  async function request(path:string,body?:object){
    const r=await fetch('/api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!r.ok) throw Error(r.status===401?'邀请码无效':'请求失败（'+r.status+'）');
    return r;
  }
  async function action(fn:()=>Promise<void>){
    B(true);E('');try{await fn()}catch(err){E(err instanceof Error?err.message:'请求失败')}finally{B(false);P('')}
  }
  async function list(){ S((await (await request('sessions')).json()).sessions) }
  async function open(id:string){
    const data=await (await request('sessions/'+encodeURIComponent(id))).json();
    I(id);P('');M(data.messages.filter((m:Message)=>['assistant','user'].includes(m.role)&&m.content));
    const d=await (await request('memory?session_id='+encodeURIComponent(id))).json();
    F(d.facts.map((f:{key:string;value:string})=>f.key+'：'+f.value));
  }
  async function login(){const data=await (await request('characters')).json();C(data.characters);K(data.characters[0]?.id||'');await list();R(true)}
  async function create(){const d=await (await request('sessions',{character_id:card})).json();await list();await open(d.session.id)}
  async function send(e:FormEvent){
    e.preventDefault();if(busy||!input.trim())return;
    const text=input;
    await action(async()=>{
      if(pending.current?.sid!==sid||pending.current?.text!==text) pending.current={sid,text,id:crypto.randomUUID()};
      const response=await request('chat',{session_id:sid,message:text,request_id:pending.current.id});
      const reader=response.body!.getReader(), decoder=new TextDecoder();let buffer='',ended=false,reason='';
      for(;;){
        const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
        const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()||'';
        for(const chunk of frames){
          const line=chunk.split(/\r?\n/).find(l=>l.startsWith('data:'));
          if(!line)continue;
          const {type,data}=JSON.parse(line.slice(5));
          if(type==='assistant_start')P('');
          if(type==='assistant_delta')P(p=>p+data.content);
          if(type==='assistant')P(data.content);
          if(type==='error')E(data.message);
          if(type==='done'){ended=true;reason=data.stop_reason}
        }
        if(done)break;
      }
      await open(sid);await list();
      if(!ended)throw Error('连接已中断，请查看已保存的对话。');
      if(reason!=='error'&&reason!=='quota'){V('');pending.current=null}
    });
  }
  return <main><h1>PetCore</h1>{error&&<p role="alert">{error}</p>}
    {!ready?<form onSubmit={e=>{e.preventDefault();void action(login)}}><label>封测邀请码<input type="password" value={token} onChange={e=>T(e.target.value)}/></label><button disabled={busy}>进入</button></form>:
    <><aside><label>角色<select disabled={busy} value={card} onChange={e=>K(e.target.value)}>{cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy||!card} onClick={()=>action(create)}>新建对话</button>
    <label>历史对话<select disabled={busy} value={sid} onChange={e=>action(()=>open(e.target.value))}><option value="" disabled>选择会话</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label></aside>
    {sid&&<section>{messages.map((m,i)=><article key={i}><small>{m.role==='user'?'你':'角色'}</small>{m.content}</article>)}{partial&&<article aria-live="polite">{partial}</article>}
    <form onSubmit={send}><label>消息<textarea value={input} disabled={busy} onChange={e=>V(e.target.value)}/></label><button disabled={busy||!input.trim()}>发送</button></form>
    <details><summary>长期记忆（{facts.length}）</summary>{facts.map(f=><p key={f}>{f}</p>)}</details></section>}</>}
    </main>;
}

import './style.css';
export const metadata = { title: 'PetCore · 对话' };
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

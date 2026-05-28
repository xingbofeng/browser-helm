// Chrome 扩展设置页 — 当前为占位，实际产品落地页已迁移至 landing/ 入口。
// 未来可在此恢复 Language / Model / Risk Policy 等设置界面。
import { createRoot } from 'react-dom/client';

function OptionsPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>BrowserHelm Settings</h1>
      <p>Settings page coming soon. Visit the <a href="/landing.html">landing page</a> for product info.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsPage />);

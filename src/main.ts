import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

// 禁用全局默认的浏览器右键菜单，防止出现 Reload 与 Inspect Element
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// 全局支持快捷键复制 (Cmd+C / Ctrl+C)，确保双击选中文本后 100% 能够写入系统剪贴板
window.addEventListener('keydown', async (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    const selectedText = window.getSelection()?.toString();
    if (selectedText && selectedText.length > 0) {
      try {
        await navigator.clipboard.writeText(selectedText);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = selectedText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    }
  }
});

const app = createApp(App);
app.mount('#app');

import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

// 禁用全局默认的浏览器右键菜单，防止出现 Reload 与 Inspect Element
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

const app = createApp(App);
app.mount('#app');

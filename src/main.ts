// Element Plus 样式必须先于本项目 token 引入，main.css 依赖这一顺序覆盖其变量。
import 'element-plus/dist/index.css'
import './styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

import App from './App.vue'
import router from './app/router'

const app = createApp(App)

app.use(createPinia())
app.use(ElementPlus)
app.use(router)

app.mount('#app')

import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import RuleList from '@/views/RuleList.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: {
      title: 'Aegis 安全监控'
    }
  },
  {
    path: '/rules',
    name: 'Rules',
    component: RuleList,
    meta: {
      title: 'Aegis 规则管理'
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = (to.meta.title as string) || 'Aegis'
  next()
})

export default router
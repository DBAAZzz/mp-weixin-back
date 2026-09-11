import { createApp, h, shallowRef } from 'vue'
import './style.css'

// 外壳刻意用 h() 写在 main.ts 里，而不是做成 App.vue：
// 任何被静态 import 的 .vue 都会进入模块图、出现在 /__inspect 的模块列表里，
// 而外壳组件不是 pages.json 中的页面、插件本就不该处理它 ——
// 它会成为列表里第一个「看不到插件生效」的模块，误导排查。
// 放在 .ts 里就没有这个问题：模块列表里只剩真正的 demo 页面。

// demo 页面全部静态 import：Vite 只转换进入模块图的文件，
// 未被 import 的页面不会出现在 /__inspect 里
import IndexPage from './pages/index/index.vue'
import FormPage from './pages/form/form.vue'
import ManualPage from './pages/manual/manual.vue'
import OptionsShorthandPage from './pages/options-shorthand/index.vue'
import OptionsObjectPage from './pages/options-object/index.vue'
import ExistingPage from './pages/existing/index.vue'
import PlainPage from './pages/plain/index.vue'
import UnregisteredPage from './pages/unregistered/index.vue'
import SubDetailPage from './pages-sub/detail/index.vue'

const pages: Record<string, unknown> = {
  index: IndexPage,
  form: FormPage,
  manual: ManualPage,
  'options-shorthand': OptionsShorthandPage,
  'options-object': OptionsObjectPage,
  existing: ExistingPage,
  plain: PlainPage,
  unregistered: UnregisteredPage,
  'sub-detail': SubDetailPage,
}

const pageList = [
  { key: 'index', label: 'index — 走全局配置' },
  { key: 'form', label: 'form — preventDefault + frequency: 3' },
  { key: 'manual', label: 'manual — initialValue: false + 手动开关' },
  { key: 'options-shorthand', label: 'options-shorthand — 方法简写' },
  { key: 'options-object', label: 'options-object — 对象写法' },
  { key: 'existing', label: 'existing — 已有 page-container（跳过）' },
  { key: 'plain', label: 'plain — 不用插件（快速跳过）' },
  { key: 'unregistered', label: 'unregistered — 未注册页面（门控跳过）' },
  { key: 'sub-detail', label: 'pages-sub/detail — 分包页面' },
]

const current = shallowRef('index')

const App = {
  setup() {
    return () =>
      h('div', { class: 'layout' }, [
        h('aside', null, [
          h('h1', null, 'mp-weixin-back'),
          h('p', { class: 'hint' }, [
            '切换页面后打开 ',
            h('a', { href: '/__inspect', target: '_blank' }, h('code', null, '/__inspect')),
            ' 对照转换产物。下拉到每个模块的 Transformed 视图。',
          ]),
          ...pageList.map((item) =>
            h(
              'button',
              {
                key: item.key,
                class: { active: item.key === current.value },
                onClick: () => (current.value = item.key),
              },
              item.label
            )
          ),
          h(
            'p',
            { class: 'hint note' },
            'web 端只能验证转换产物。真实拦截效果需在小程序里手势返回验证。'
          ),
        ]),
        h('main', null, [h(pages[current.value] as never)]),
      ])
  },
}

createApp(App).mount('#app')

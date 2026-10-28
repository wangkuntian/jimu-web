import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { expect, it, vi } from 'vitest'

import ManagementRowActions from '../../src/shared/components/ManagementRowActions.vue'

it('opens the actual overflow menu and dispatches its action', async () => {
  const onDelete = vi.fn()
  const wrapper = mount(ManagementRowActions, {
    attachTo: document.body,
    props: { label: 'Alice', hasMore: true },
    slots: {
      default: '<el-button text>编辑</el-button>',
      more: defineComponent({
        template: '<el-dropdown-item @click="onDelete">删除</el-dropdown-item>',
        setup: () => ({ onDelete }),
      }),
    },
    global: { plugins: [ElementPlus] },
  })
  try {
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull())
    ;(document.querySelector('[role="menuitem"]') as HTMLElement).click()
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
  } finally {
    wrapper.unmount()
  }
})

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchAuthConfig, fetchCaptcha, login } from '../api'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import AuthLayout from '../../../layouts/AuthLayout.vue'

const route = useRoute()
const router = useRouter()

const form = reactive({
  username: '',
  password: '',
  totpCode: '',
  captchaCode: '',
  rememberDevice: false,
})

const captchaImage = ref('')
const captchaId = ref('')
const needsTotp = ref(false)
const needsCaptcha = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

// 注册入口由运行时的公开开关决定：未知或关闭时都不显示（fail-closed）。
const canRegister = ref(false)

const registrationSucceeded = computed(() => route.query.registered === '1')

/** 读取公开开关；失败时保持不显示注册入口，不影响登录本身。 */
async function loadAuthConfig(): Promise<void> {
  try {
    const config = await fetchAuthConfig()
    canRegister.value = config.public_registration === true
  } catch {
    canRegister.value = false
  }
}

onMounted(() => {
  void loadAuthConfig()
})

/** 拉取验证码；失败时就地反馈，不向上抛出。 */
async function tryLoadCaptcha(): Promise<boolean> {
  try {
    const captcha = await fetchCaptcha()
    captchaId.value = captcha.captcha_id
    captchaImage.value = captcha.captcha_image
    return true
  } catch {
    captchaId.value = ''
    captchaImage.value = ''
    return false
  }
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''

  try {
    await login({
      username: form.username,
      password: form.password,
      ...(needsTotp.value ? { totp_code: form.totpCode } : {}),
      ...(needsCaptcha.value
        ? { captcha_id: captchaId.value, captcha_code: form.captchaCode }
        : {}),
      remember_device: form.rememberDevice,
    })

    // 只跟随站内绝对路径：`//evil.example` 这类协议相对地址会被浏览器当作外站，
    // 其余形状（非字符串、相对路径、外站 URL）一律回落到默认入口。
    const redirect = route.query.redirect
    await router.push(
      typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/portal',
    )
  } catch (error) {
    await handleError(error)
  } finally {
    submitting.value = false
  }
}

async function handleError(error: unknown): Promise<void> {
  if (!(error instanceof ApiError)) {
    errorMessage.value = '网络异常，请重试'
    return
  }

  switch (error.code) {
    case ErrorCode.mfaRequired:
      needsTotp.value = true
      errorMessage.value = '该账号启用了二次验证，请输入验证器中的 6 位验证码'
      return
    case ErrorCode.invalidMfa:
      errorMessage.value = '验证码无效，请重新输入'
      return
    case ErrorCode.captchaRequired:
      needsCaptcha.value = true
      errorMessage.value = (await tryLoadCaptcha()) ? '请输入图形验证码' : '验证码加载失败，请重试'
      return
    case ErrorCode.captchaInvalid:
      form.captchaCode = ''
      errorMessage.value = (await tryLoadCaptcha())
        ? '验证码错误，请重新输入'
        : '验证码加载失败，请重试'
      return
    case ErrorCode.rateLimited:
      errorMessage.value = '尝试过于频繁，请稍后再试'
      return
    default:
      errorMessage.value = error.message
  }
}
</script>

<template>
  <AuthLayout>
    <h1 class="page-section">登录 Jimu Portal</h1>

    <el-alert
      v-if="registrationSucceeded"
      title="注册成功，请使用新账号登录"
      type="success"
      :closable="false"
      show-icon
    />

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="用户名">
        <el-input v-model="form.username" autocomplete="username" data-test="username" />
      </el-form-item>

      <el-form-item label="密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="current-password"
          data-test="password"
        />
      </el-form-item>

      <el-form-item v-if="needsTotp" label="二次验证码" data-test="totp">
        <el-input
          v-model="form.totpCode"
          inputmode="numeric"
          maxlength="6"
          autocomplete="one-time-code"
        />
      </el-form-item>

      <el-form-item v-if="needsCaptcha" label="图形验证码" data-test="captcha">
        <div class="captcha-row">
          <el-input v-model="form.captchaCode" autocomplete="off" />
          <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="captcha-image" />
        </div>
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.rememberDevice">记住此设备</el-checkbox>
      </el-form-item>

      <el-button type="primary" native-type="submit" :loading="submitting">登录</el-button>

      <RouterLink v-if="canRegister" class="register-link" data-test="register-link" to="/register">
        注册新账号
      </RouterLink>
    </el-form>
  </AuthLayout>
</template>

<style scoped>
.register-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--jp-color-accent);
  font-size: var(--jp-font-size-body);
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.captcha-image {
  height: 32px;
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}
</style>

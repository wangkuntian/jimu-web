<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'

import { fetchAuthConfig, fetchCaptcha, register } from '../api'
import type { RegisterPayload } from '../api'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import AuthLayout from '../../../layouts/AuthLayout.vue'

const router = useRouter()

const form = reactive({
  username: '',
  password: '',
  tenantName: '',
  tenantCode: '',
  captchaCode: '',
})

const formRef = ref<FormInstance>()
const configLoaded = ref(false)
const publicRegistration = ref(false)
const provisioningEnabled = ref(false)
const needsCaptcha = ref(false)
const captchaId = ref('')
const captchaImage = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const requestId = ref('')

// tenant_name 只在开通式注册下必填；tenant_code 始终可选，但格式受后端约束。
const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_]{4,20}$/,
      message: '用户名需 4–20 位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      pattern: /^(?=.*[A-Za-z])(?=.*\d)\S{8,32}$/,
      message: '密码需 8–32 位且同时包含字母和数字',
      trigger: 'blur',
    },
  ],
  tenantName: provisioningEnabled.value
    ? [
        { required: true, message: '请输入租户名称', trigger: 'blur' },
        { max: 128, message: '租户名称最多 128 个字符', trigger: 'blur' },
      ]
    : [],
  tenantCode: [
    {
      pattern: /^[A-Za-z0-9_-]*$/,
      message: '租户编码仅限字母、数字、短横线和下划线',
      trigger: 'blur',
    },
    { max: 64, message: '租户编码最多 64 个字符', trigger: 'blur' },
  ],
}))

/**
 * 读取公开开关。
 *
 * fail-closed：请求失败时不放行注册入口，即使后端只是短暂不可用。
 */
async function loadConfig(): Promise<void> {
  try {
    const config = await fetchAuthConfig()
    publicRegistration.value = config.public_registration
    provisioningEnabled.value = config.provisioning_enabled
    configLoaded.value = true
  } catch {
    publicRegistration.value = false
    provisioningEnabled.value = false
    configLoaded.value = false
  }
}

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

async function validateForm(): Promise<boolean> {
  if (!formRef.value) return false

  try {
    await formRef.value.validate()
    return true
  } catch {
    return false
  }
}

/** 只发送本次注册真正需要的字段：后端会静默忽略多余的租户字段。 */
function buildPayload(): RegisterPayload {
  const payload: RegisterPayload = {
    username: form.username,
    password: form.password,
  }

  if (provisioningEnabled.value) {
    payload.tenant_name = form.tenantName
    if (form.tenantCode !== '') {
      payload.tenant_code = form.tenantCode
    }
  }

  if (needsCaptcha.value) {
    payload.captcha_id = captchaId.value
    payload.captcha_code = form.captchaCode
  }

  return payload
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  errorMessage.value = ''
  requestId.value = ''

  if (!(await validateForm())) return

  submitting.value = true

  try {
    await register(buildPayload())

    // 注册不签发令牌，一律回登录页重新登录。
    await router.push({ path: '/login', query: { registered: '1' } })
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

  requestId.value = error.requestId ?? ''

  switch (error.code) {
    case ErrorCode.userExists:
      errorMessage.value = '该用户名已被占用'
      return
    case ErrorCode.rateLimited:
      errorMessage.value = '注册请求过于频繁，请稍后再试'
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
    default:
      errorMessage.value = error.message
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <AuthLayout>
    <h1 class="page-section">注册 Jimu Portal</h1>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

    <p v-if="requestId" class="request-id">请求编号：{{ requestId }}</p>

    <div v-if="!publicRegistration" data-test="register-closed" class="register-closed">
      <p class="page-note">
        {{ configLoaded ? '注册未开放' : '无法确认注册开关，请稍后重试' }}
      </p>

      <div class="register-closed-actions">
        <el-button v-if="!configLoaded" @click="loadConfig">重试</el-button>
        <RouterLink class="register-back" to="/login">返回登录</RouterLink>
      </div>
    </div>

    <el-form
      v-else
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="onSubmit"
    >
      <el-form-item label="用户名" prop="username" data-test="username">
        <el-input v-model="form.username" autocomplete="username" />
      </el-form-item>

      <el-form-item label="密码" prop="password" data-test="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>

      <el-form-item
        v-if="provisioningEnabled"
        label="租户名称"
        prop="tenantName"
        data-test="tenant-name"
      >
        <el-input v-model="form.tenantName" autocomplete="organization" />
      </el-form-item>

      <el-form-item
        v-if="provisioningEnabled"
        label="租户编码（可选）"
        prop="tenantCode"
        data-test="tenant-code"
      >
        <el-input v-model="form.tenantCode" />
      </el-form-item>

      <el-form-item v-if="needsCaptcha" label="图形验证码" data-test="captcha">
        <div class="captcha-row">
          <el-input v-model="form.captchaCode" autocomplete="off" />
          <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="captcha-image" />
        </div>
      </el-form-item>

      <el-button type="primary" native-type="submit" :loading="submitting">注册</el-button>

      <p class="page-note">注册成功后请使用新账号登录。</p>
    </el-form>
  </AuthLayout>
</template>

<style scoped>
.request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.register-closed {
  margin-top: 24px;
}

.register-closed-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.register-back {
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

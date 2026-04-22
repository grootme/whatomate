<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOrganizationStore } from '@/stores/organization'
import { whatsappService } from '@/services/whatsapp'
import { useToast } from '@/lib/toast'
import type { WhatsAppAccount } from '@/types/whatsapp'
import { 
  Plus, 
  Settings2, 
  Trash2, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ExternalLink,
  Smartphone,
  Cloud,
  QrCode
} from 'lucide-vue-next'
import { useWebSocketStore } from '@/stores/websocket'

const { t } = useI18n()
const orgStore = useOrganizationStore()
const wsStore = useWebSocketStore()
const { toast } = useToast()

const accounts = ref<WhatsAppAccount[]>([])
const loading = ref(true)
const dialogOpen = ref(false)
const testingConnection = ref<string | null>(null)
const subscribing = ref<string | null>(null)
const startingSession = ref<string | null>(null)

const form = ref({
  id: '',
  name: '',
  client_type: 'meta', // meta, whatsmeow
  app_id: '',
  phone_id: '',
  business_id: '',
  access_token: '',
  app_secret: '',
  api_version: 'v21.0',
  is_default_incoming: false,
  is_default_outgoing: false,
  auto_read_receipt: true
})

const isEditing = computed(() => !!form.ref.id)

const fetchAccounts = async () => {
  try {
    loading.value = true
    const data = await whatsappService.listAccounts()
    accounts.value = data
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
    toast({
      title: t('common.error'),
      description: t('common.failedLoad', { resource: t('resources.accounts') }),
      variant: 'destructive'
    })
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  form.value = {
    id: '',
    name: '',
    client_type: 'meta',
    app_id: '',
    phone_id: '',
    business_id: '',
    access_token: '',
    app_secret: '',
    api_version: 'v21.0',
    is_default_incoming: false,
    is_default_outgoing: false,
    auto_read_receipt: true
  }
  dialogOpen.value = true
}

const openEditDialog = (account: WhatsAppAccount) => {
  form.value = {
    id: account.id,
    name: account.name,
    client_type: account.client_type || 'meta',
    app_id: account.app_id || '',
    phone_id: account.phone_id || '',
    business_id: account.business_id || '',
    access_token: '', // Don't populate access token for security
    app_secret: '', // Don't populate app secret for security
    api_version: account.api_version || 'v21.0',
    is_default_incoming: account.is_default_incoming,
    is_default_outgoing: account.is_default_outgoing,
    auto_read_receipt: account.auto_read_receipt
  }
  dialogOpen.value = true
}

const saveAccount = async () => {
  if (!form.value.name || !form.value.phone_id) {
    toast({
      title: t('common.warning'),
      description: t('accounts.fillRequiredMinimal'),
      variant: 'warning'
    })
    return
  }

  if (form.value.client_type === 'meta' && (!form.value.business_id || (!form.value.id && !form.value.access_token))) {
    toast({
      title: t('common.warning'),
      description: t('accounts.fillRequiredMeta'),
      variant: 'warning'
    })
    return
  }

  try {
    if (isEditing.value) {
      await whatsappService.updateAccount(form.value.id, form.value)
      toast({
        title: t('common.success'),
        description: t('common.updatedSuccess', { resource: t('resources.account') })
      })
    } else {
      await whatsappService.createAccount(form.value)
      toast({
        title: t('common.success'),
        description: t('common.createdSuccess', { resource: t('resources.account') })
      })
    }
    dialogOpen.value = false
    fetchAccounts()
  } catch (error) {
    console.error('Failed to save account:', error)
    toast({
      title: t('common.error'),
      description: isEditing.value 
        ? t('common.failedUpdate', { resource: t('resources.account') })
        : t('common.failedCreate', { resource: t('resources.account') }),
      variant: 'destructive'
    })
  }
}

const deleteAccount = async (id: string) => {
  if (!confirm(t('common.deleteConfirmMessage', { resource: t('resources.account') }))) {
    return
  }

  try {
    await whatsappService.deleteAccount(id)
    toast({
      title: t('common.success'),
      description: t('common.deletedSuccess', { resource: t('resources.account') })
    })
    fetchAccounts()
  } catch (error) {
    console.error('Failed to delete account:', error)
    toast({
      title: t('common.error'),
      description: t('common.failedDelete', { resource: t('resources.account') }),
      variant: 'destructive'
    })
  }
}

const testConnection = async (id: string) => {
  try {
    testingConnection.value = id
    const result = await whatsappService.testConnection(id)
    if (result.success) {
      toast({
        title: t('accounts.connectionSuccess'),
        description: result.is_test_number ? t('accounts.isTestNumber') : t('common.success')
      })
      fetchAccounts()
    } else {
      toast({
        title: t('accounts.connectionFailed'),
        description: result.error || t('accounts.connectionTestFailed'),
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error('Failed to test connection:', error)
    toast({
      title: t('accounts.connectionFailed'),
      description: t('accounts.connectionTestFailed'),
      variant: 'destructive'
    })
  } finally {
    testingConnection.value = null
  }
}

const subscribeApp = async (id: string) => {
  try {
    subscribing.value = id
    const result = await whatsappService.subscribeApp(id)
    if (result.success) {
      toast({
        title: t('accounts.subscribeSuccess'),
        description: result.message
      })
      fetchAccounts()
    } else {
      toast({
        title: t('accounts.subscribeFailed'),
        description: result.error || t('accounts.subscribeError'),
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error('Failed to subscribe app:', error)
    toast({
      title: t('accounts.subscribeFailed'),
      description: t('accounts.subscribeError'),
      variant: 'destructive'
    })
  } finally {
    subscribing.value = null
  }
}

const startSession = async (id: string) => {
  try {
    startingSession.value = id
    const result = await whatsappService.startSession(id)
    if (result.success) {
      toast({
        title: t('accounts.sessionStartSuccess'),
        description: result.message
      })
      fetchAccounts()
    } else {
      toast({
        title: t('accounts.sessionStartFailed'),
        description: result.error || t('accounts.sessionStartError'),
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error('Failed to start session:', error)
    toast({
      title: t('accounts.sessionStartFailed'),
      description: t('accounts.sessionStartError'),
      variant: 'destructive'
    })
  } finally {
    startingSession.value = null
  }
}

// WebSocket event handling for QR codes
onMounted(() => {
  fetchAccounts()
  
  // Listen for QR code updates via WebSocket
  wsStore.$onAction(({ name, args }) => {
    if (name === 'onMessage' && args[0].type === 'whatsapp_qr_code') {
      const payload = args[0].payload
      const account = accounts.value.find(a => a.id === payload.account_id)
      if (account) {
        account.qr_code = payload.qr_code
        if (payload.status === 'connected') {
          account.status = 'active'
          account.qr_code = ''
          toast({
            title: t('accounts.connected'),
            description: t('accounts.loggedInSuccess', { name: account.name })
          })
        }
      }
    }
  })
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">{{ t('accounts.title') }}</h1>
        <p class="text-muted-foreground">
          {{ t('accounts.noAccountsDesc') }}
        </p>
      </div>
      <Button @click="openCreateDialog">
        <Plus class="mr-2 h-4 w-4" />
        {{ t('accounts.addAccount') }}
      </Button>
    </div>

    <div v-if="loading" class="flex h-[400px] items-center justify-center">
      <div class="flex flex-col items-center gap-2">
        <RefreshCcw class="h-8 w-8 animate-spin text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
      </div>
    </div>

    <div v-else-if="accounts.length === 0" class="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
      <div class="mx-auto flex max-w-[420px] flex-col items-center justify-center">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Settings2 class="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 class="mt-6 text-xl font-semibold">{{ t('accounts.noAccounts') }}</h2>
        <p class="mt-2 text-center text-sm font-normal leading-snug text-muted-foreground">
          {{ t('accounts.noAccountsDesc') }}
        </p>
        <Button class="mt-6" @click="openCreateDialog">
          <Plus class="mr-2 h-4 w-4" />
          {{ t('accounts.addAccount') }}
        </Button>
      </div>
    </div>

    <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="account in accounts" :key="account.id" class="flex flex-col">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div class="space-y-1">
            <CardTitle class="text-lg font-bold">{{ account.name }}</CardTitle>
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="capitalize">
                <Cloud v-if="account.client_type === 'meta'" class="mr-1 h-3 w-3" />
                <Smartphone v-else class="mr-1 h-3 w-3" />
                {{ account.client_type || 'meta' }}
              </Badge>
              <Badge :variant="account.status === 'active' ? 'default' : 'secondary'" class="capitalize">
                {{ account.status }}
              </Badge>
            </div>
          </div>
          <div class="flex gap-1">
            <Button variant="ghost" size="icon" @click="openEditDialog(account)">
              <Settings2 class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" class="text-destructive" @click="deleteAccount(account.id)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent class="flex-1 space-y-4 pt-4">
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">{{ t('accounts.phoneNumberId') }}:</span>
              <span class="font-mono">{{ account.phone_id }}</span>
            </div>
            <div v-if="account.client_type === 'meta'" class="flex justify-between">
              <span class="text-muted-foreground">{{ t('accounts.businessAccountId') }}:</span>
              <span class="font-mono">{{ account.business_id }}</span>
            </div>
            <div v-if="account.client_type === 'whatsmeow'" class="flex justify-between">
              <span class="text-muted-foreground">{{ t('accounts.whatsmeowJid') }}:</span>
              <span class="font-mono text-xs">{{ account.phone_id }}</span>
            </div>
          </div>

          <!-- QR Code Display for Whatsmeow -->
          <div v-if="account.client_type === 'whatsmeow' && account.status !== 'active'" class="space-y-4 rounded-lg bg-muted p-4 text-center">
            <div v-if="account.qr_code" class="flex flex-col items-center gap-2">
              <div class="rounded-lg border-2 border-primary bg-white p-2 shadow-md">
                <qrcode-vue :value="account.qr_code" :size="160" level="H" />
              </div>
              <p class="text-sm font-medium text-muted-foreground">
                {{ t('accounts.scanQrCode') }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ t('accounts.qrCodeHint') }}
              </p>
            </div>
            <div v-else-if="account.status === 'pending'" class="flex flex-col items-center justify-center h-40">
              <RefreshCcw class="h-8 w-8 animate-spin text-muted-foreground" />
              <p class="text-sm text-muted-foreground mt-2">{{ t('common.loading') }}</p>
            </div>
            <div v-else>
              <Button 
                variant="secondary" 
                class="w-full" 
                @click="startSession(account.id)"
                :disabled="startingSession === account.id"
              >
                <QrCode v-if="startingSession !== account.id" class="mr-2 h-4 w-4" />
                <RefreshCcw v-else class="mr-2 h-4 w-4 animate-spin" />
                {{ t('accounts.startSession') }}
              </Button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              class="flex-1" 
              @click="testConnection(account.id)"
              :disabled="testingConnection === account.id"
            >
              <RefreshCcw v-if="testingConnection === account.id" class="mr-2 h-4 w-4 animate-spin" />
              <CheckCircle2 v-else class="mr-2 h-4 w-4" />
              {{ t('accounts.test') }}
            </Button>
            <Button 
              v-if="account.client_type === 'meta'"
              variant="outline" 
              size="sm" 
              class="flex-1" 
              @click="subscribeApp(account.id)"
              :disabled="subscribing === account.id"
            >
              <RefreshCcw v-if="subscribing === account.id" class="mr-2 h-4 w-4 animate-spin" />
              <CheckCircle2 v-else class="mr-2 h-4 w-4" />
              {{ t('accounts.subscribe') }}
            </Button>
          </div>
        </CardContent>
        <CardFooter class="border-t bg-muted/50 px-6 py-3">
          <div class="flex w-full items-center justify-between text-xs text-muted-foreground">
            <div class="flex items-center gap-1">
              <CheckCircle2 v-if="account.is_default_outgoing" class="h-3 w-3 text-primary" />
              <span :class="{ 'text-primary font-medium': account.is_default_outgoing }">
                {{ account.is_default_outgoing ? t('accounts.defaultOutgoing') : '' }}
              </span>
            </div>
            <span>{{ t('common.updatedAt') }}: {{ new Date(account.updated_at).toLocaleDateString() }}</span>
          </div>
        </CardFooter>
      </Card>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? t('accounts.editAccount') : t('accounts.createAccount') }}</DialogTitle>
          <DialogDescription>
            {{ t('accounts.connectDescription') }}
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <Label for="name">{{ t('accounts.accountName') }}</Label>
            <Input id="name" v-model="form.name" :placeholder="t('accounts.accountNamePlaceholder')" />
          </div>

          <div class="grid gap-2">
            <Label>{{ t('accounts.clientType') }}</Label>
            <RadioGroup v-model="form.client_type" class="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem value="meta" id="meta" class="peer sr-only" />
                <Label
                  for="meta"
                  class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Cloud class="mb-3 h-6 w-6" />
                  <span class="text-sm font-medium">Meta Cloud API</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="whatsmeow" id="whatsmeow" class="peer sr-only" />
                <Label
                  for="whatsmeow"
                  class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Smartphone class="mb-3 h-6 w-6" />
                  <span class="text-sm font-medium">Whatsmeow (QR Code)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div v-if="form.client_type === 'meta'" class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label for="app_id">{{ t('accounts.metaAppId') }}</Label>
              <Input id="app_id" v-model="form.app_id" :placeholder="t('accounts.metaAppIdPlaceholder')" />
            </div>
            <div class="grid gap-2">
              <Label for="api_version">{{ t('accounts.apiVersion') }}</Label>
              <Input id="api_version" v-model="form.api_version" placeholder="v21.0" />
            </div>
          </div>

          <div class="grid gap-2">
            <Label for="phone_id">
              {{ form.client_type === 'whatsmeow' ? t('accounts.whatsmeowJid') : t('accounts.phoneNumberId') }}
            </Label>
            <Input 
              id="phone_id" 
              v-model="form.phone_id" 
              :placeholder="form.client_type === 'whatsmeow' ? t('accounts.whatsmeowJidPlaceholder') : t('accounts.phoneNumberIdPlaceholder')" 
            />
            <p class="text-[0.8rem] text-muted-foreground">
              {{ form.client_type === 'whatsmeow' ? t('accounts.whatsmeowJidHint') : t('accounts.phoneNumberIdHint') }}
            </p>
          </div>

          <div v-if="form.client_type === 'meta'" class="grid gap-2">
            <Label for="business_id">{{ t('accounts.businessAccountId') }}</Label>
            <Input id="business_id" v-model="form.business_id" :placeholder="t('accounts.businessAccountIdPlaceholder')" />
          </div>

          <div v-if="form.client_type === 'meta'" class="grid gap-2">
            <Label for="access_token">{{ t('accounts.accessToken') }}</Label>
            <Input 
              id="access_token" 
              v-model="form.access_token" 
              type="password"
              :placeholder="isEditing ? t('accounts.accessTokenKeepExisting') : t('accounts.accessTokenPlaceholder')" 
            />
            <p class="text-[0.8rem] text-muted-foreground">
              {{ t('accounts.accessTokenHint') }}
            </p>
          </div>

          <div v-if="form.client_type === 'meta'" class="grid gap-2">
            <Label for="app_secret">{{ t('accounts.appSecret') }}</Label>
            <Input 
              id="app_secret" 
              v-model="form.app_secret" 
              type="password"
              :placeholder="isEditing ? t('accounts.accessTokenKeepExisting') : t('accounts.appSecretPlaceholder')" 
            />
            <p class="text-[0.8rem] text-muted-foreground">
              {{ t('accounts.appSecretHint') }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4 pt-2">
            <div class="flex items-center space-x-2">
              <Checkbox id="default_incoming" v-model:checked="form.is_default_incoming" />
              <Label for="default_incoming" class="text-sm font-normal">{{ t('accounts.defaultIncoming') }}</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="default_outgoing" v-model:checked="form.is_default_outgoing" />
              <Label for="default_outgoing" class="text-sm font-normal">{{ t('accounts.defaultOutgoing') }}</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="auto_read" v-model:checked="form.auto_read_receipt" />
              <Label for="auto_read" class="text-sm font-normal">{{ t('accounts.autoReadReceipt') }}</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">{{ t('common.cancel') }}</Button>
          <Button @click="saveAccount">{{ t('common.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

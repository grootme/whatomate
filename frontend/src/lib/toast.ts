import { ref } from 'vue'

// Toast composable using vue-sonner
const toastFn = ref<any>(null)

export function setToastFunction(fn: any) {
  toastFn.value = fn
}

export function useToast() {
  const toast = (options: {
    title?: string
    description?: string
    variant?: 'default' | 'destructive' | 'warning' | 'success'
  }) => {
    if (toastFn.value) {
      toastFn.value(options)
    } else {
      // Fallback: use console
      console.log(`[Toast ${options.variant || 'info'}] ${options.title}: ${options.description}`)
    }
  }

  return { toast }
}

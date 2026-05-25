import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWebSocketStore = defineStore('websocket', () => {
  const connected = ref(false)
  const lastMessage = ref<any>(null)

  function onMessage(msg: any) {
    lastMessage.value = msg
  }

  function setConnected(val: boolean) {
    connected.value = val
  }

  return { connected, lastMessage, onMessage, setConnected }
})

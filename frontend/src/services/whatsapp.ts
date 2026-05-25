import { api } from './api'

export const whatsappService = {
  listAccounts: async () => {
    const res = await api.get('/accounts')
    return res.data.data || res.data
  },

  getAccount: async (id: string) => {
    const res = await api.get(`/accounts/${id}`)
    return res.data.data || res.data
  },

  createAccount: async (data: any) => {
    const res = await api.post('/accounts', data)
    return res.data.data || res.data
  },

  updateAccount: async (id: string, data: any) => {
    const res = await api.put(`/accounts/${id}`, data)
    return res.data.data || res.data
  },

  deleteAccount: async (id: string) => {
    const res = await api.delete(`/accounts/${id}`)
    return res.data.data || res.data
  },

  testConnection: async (id: string) => {
    const res = await api.post(`/accounts/${id}/test`)
    return res.data.data || res.data
  },

  subscribeApp: async (id: string) => {
    const res = await api.post(`/accounts/${id}/subscribe`)
    return res.data.data || res.data
  },

  startSession: async (id: string) => {
    const res = await api.post(`/accounts/${id}/start-session`)
    return res.data.data || res.data
  },

  getBusinessProfile: async (id: string) => {
    const res = await api.get(`/accounts/${id}/business_profile`)
    return res.data.data || res.data
  },

  updateBusinessProfile: async (id: string, data: any) => {
    const res = await api.put(`/accounts/${id}/business_profile`, data)
    return res.data.data || res.data
  }
}

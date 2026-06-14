// src/hooks/use-modules.ts

import { useState, useEffect } from 'react'
import { ModuleId } from '@/types/roles'

interface UseModulesReturn {
  modules: ModuleId[]
  loading: boolean
  isModuleEnabled: (moduleId: ModuleId) => boolean
}

export function useModules(): UseModulesReturn {
  const [modules, setModules] = useState<ModuleId[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const token = localStorage.getItem('ess_access_token')
        const response = await fetch('/api/modules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!response.ok) {
          setModules(['leave', 'expense'])
          return
        }

        const data = await response.json()
        setModules(Array.isArray(data.modules_enabled) ? data.modules_enabled : ['leave', 'expense'])
      } catch {
        setModules(['leave', 'expense'])
      } finally {
        setLoading(false)
      }
    }

    fetchModules()
  }, [])

  const isModuleEnabled = (moduleId: ModuleId) => modules.includes(moduleId)

  return { modules, loading, isModuleEnabled }
}

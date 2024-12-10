/** @deprecated TODO REMOVE THIS FILE */
// Inspiuration for cache invalidation

import create from 'zustand'

const createSpectodaStore = (spectodaNode) => create((set, get) => ({
  queries: {},

  fetchData: async (key, fetcher) => {
    set(state => ({
      queries: {
        ...state.queries,
        [key]: { ...state.queries[key], isLoading: true, error: null }
      }
    }))

    try {
      const data = await fetcher()
      set(state => ({
        queries: {
          ...state.queries,
          [key]: { data, isStale: false, lastFetchTime: Date.now(), isLoading: false, error: null }
        }
      }))
      return data
    } catch (error) {
      set(state => ({
        queries: {
          ...state.queries,
          [key]: { ...state.queries[key], error, isLoading: false }
        }
      }))
      throw error
    }
  },

  invalidateQuery: (key) => {
    set(state => ({
      queries: {
        ...state.queries,
        [key]: { ...state.queries[key], isStale: true }
      }
    }))
  },

  getQuery: (key) => {
    return get().queries[key]
  },

  // Spectoda-specific methods
  setName: async (name) => {
    await spectodaNode.writeControllerName(name)
    get().invalidateQuery('name')
  },

  setConfig: async (config) => {
    await spectodaNode.writeConfig(config)
    get().invalidateQuery('config')
  },

  getName: async () => {
    const nameQuery = get().getQuery('name')
    if (!nameQuery || nameQuery.isStale) {
      return get().fetchData('name', () => spectodaNode.readControllerName())
    }
    return nameQuery.data
  },

  getConfig: async () => {
    const configQuery = get().getQuery('config')
    if (!configQuery || configQuery.isStale) {
      return get().fetchData('config', () => spectodaNode.readConfig())
    }
    return configQuery.data
  },

  // New method to force fetch from hardware
  forceRefreshConfig: () => {
    return get().fetchData('config', () => spectodaNode.readConfig())
  }
}))

// Usage
const spectoda = new Spectoda()
const useSpectodaStore = createSpectodaStore(spectoda.getNode('/path1'))

function SpectodaComponent() {
  const { getConfig, setConfig, forceRefreshConfig } = useSpectodaStore()
  const [config, setConfigState] = React.useState(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const fetchConfig = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const newConfig = await getConfig()
      setConfigState(newConfig)
    } catch (err) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchConfig()
  }, [])

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h2>Config: {JSON.stringify(config)}</h2>
      <button onClick={() => setConfig({ some: 'new config' }).then(fetchConfig)}>
        Set New Config
      </button>
      <button onClick={() => forceRefreshConfig().then(setConfigState)}>
        Force Refresh Config
      </button>
    </div>
  )
}
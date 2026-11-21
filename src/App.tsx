import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import HardPage from './pages/HardPage'
import HardPractice from './pages/HardPractice'
import Home from './pages/Home'
import LotsPage from './pages/LotsPage'
import PracticePage from './pages/PracticePage'
import SettingsPage from './pages/SettingsPage'
import { useApp } from './store'
import { applyAppearance, watchSystemTheme } from './theme'

export default function App() {
  const refresh = useApp((s) => s.refresh)
  const theme = useApp((s) => s.settings.theme)
  const skin = useApp((s) => s.skin)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    applyAppearance(skin, theme)
    return theme === 'system' ? watchSystemTheme(() => applyAppearance(skin, theme)) : undefined
  }, [skin, theme])

  return (
    <div className="window">
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="lots" element={<LotsPage />} />
            <Route path="hard" element={<HardPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="practice" element={<PracticePage />} />
          <Route path="hard/practice" element={<HardPractice />} />
        </Routes>
      </HashRouter>
    </div>
  )
}

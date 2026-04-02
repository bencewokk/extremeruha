import React from 'react'
import { Routes, Route } from 'react-router-dom'

const Home = React.lazy(() => import('./Home'))
const Admin = React.lazy(() => import('./admin/Admin'))

export default function App() {
  return (
    <React.Suspense fallback={<div className="p-6">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </React.Suspense>
  )
}

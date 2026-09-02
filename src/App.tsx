import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import ScrollProgress from './components/ScrollProgress'
import { AuthProvider } from './context/AuthProvider'
import PrivateRoute from './components/dashboard/PrivateRoute'
import DashboardLayout from './components/dashboard/DashboardLayout'
import DashboardNotFound from './components/dashboard/DashboardNotFound'
import { ROLE } from './data/roleAccess'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'

import CompanyDashboardHome from './pages/CompanyDashboard/Dashboard'
import CompanyBookings from './pages/CompanyDashboard/Bookings'
import CompanyStudents from './pages/CompanyDashboard/Students'
import CompanyEmployees from './pages/CompanyDashboard/Employees'
import CompanySchedule from './pages/CompanyDashboard/Schedule'
import CompanyBooks from './pages/CompanyDashboard/Books'
import CompanySubscription from './pages/CompanyDashboard/Subscription'
import CompanySettings from './pages/CompanyDashboard/Settings'

import TeacherDashboardHome from './pages/TeacherDashboard/Dashboard'
import TeacherBookings from './pages/TeacherDashboard/Bookings'
import TeacherStudents from './pages/TeacherDashboard/Students'
import TeacherSchedule from './pages/TeacherDashboard/Schedule'
import TeacherBooks from './pages/TeacherDashboard/Books'
import TeacherSubscription from './pages/TeacherDashboard/Subscription'
import TeacherSettings from './pages/TeacherDashboard/Settings'

import StudentDashboardHome from './pages/StudentDashboard/Dashboard'
import StudentClasses from './pages/StudentDashboard/Classes'
import StudentTeachers from './pages/StudentDashboard/Teachers'
import StudentCredit from './pages/StudentDashboard/Credit'

import './App.css'

const noChromeExact = ['/login', '/register']
const dashboardPrefixes = ['/company-dashboard', '/teacher-dashboard', '/student-dashboard']

function App() {
  const { pathname } = useLocation()
  const hideChrome =
    noChromeExact.includes(pathname) || dashboardPrefixes.some((prefix) => pathname.startsWith(prefix))

  return (
    <AuthProvider>
      <div className="app">
        <ScrollToTop />
        <ScrollProgress />
        {!hideChrome && <Navbar />}

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/CompanyDashboard"
              element={
                <PrivateRoute allowedRole={ROLE.COMPANY}>
                  <DashboardLayout role={ROLE.COMPANY} />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<CompanyDashboardHome />} />
              <Route path="bookings" element={<CompanyBookings />} />
              <Route path="students" element={<CompanyStudents />} />
              <Route path="employees" element={<CompanyEmployees />} />
              <Route path="schedule" element={<CompanySchedule />} />
              <Route path="books" element={<CompanyBooks />} />
              <Route path="subscription" element={<CompanySubscription />} />
              <Route path="settings" element={<CompanySettings />} />
              <Route path="*" element={<DashboardNotFound />} />
            </Route>

            <Route
              path="/TeacherDashboard"
              element={
                <PrivateRoute allowedRole={ROLE.TEACHER}>
                  <DashboardLayout role={ROLE.TEACHER} />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboardHome />} />
              <Route path="bookings" element={<TeacherBookings />} />
              <Route path="students" element={<TeacherStudents />} />
              <Route path="schedule" element={<TeacherSchedule />} />
              <Route path="books" element={<TeacherBooks />} />
              <Route path="subscription" element={<TeacherSubscription />} />
              <Route path="settings" element={<TeacherSettings />} />
              <Route path="*" element={<DashboardNotFound />} />
            </Route>

            <Route
              path="/StudentDashboard"
              element={
                <PrivateRoute allowedRole={ROLE.STUDENT}>
                  <DashboardLayout role={ROLE.STUDENT} />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboardHome />} />
              <Route path="classes" element={<StudentClasses />} />
              <Route path="teachers" element={<StudentTeachers />} />
              <Route path="credit" element={<StudentCredit />} />
              <Route path="*" element={<DashboardNotFound />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {!hideChrome && <Footer />}
      </div>
    </AuthProvider>
  )
}

export default App

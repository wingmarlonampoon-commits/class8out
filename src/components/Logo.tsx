import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'
import logoUrl from '../assets/Class8out_logo.svg'
import './Logo.css'

type LogoProps = {
  onClick?: () => void
  large?: boolean
}

function Logo({ onClick, large }: LogoProps) {
  const handleClick = (e: MouseEvent) => {
    if (onClick) {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <Link to="/" className={`logo ${large ? 'logo-large' : ''}`} onClick={handleClick}>
      <img src={logoUrl} alt="Class8out" className="logo-image" />
    </Link>
  )
}

export default Logo

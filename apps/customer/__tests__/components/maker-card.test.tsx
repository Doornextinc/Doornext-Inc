import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MakerCard } from '@/components/home/maker-card'
import type { FoodMaker } from '@/types'

const makeMaker = (overrides?: Partial<FoodMaker>): FoodMaker => ({
  id: 'maker-1',
  user_id: 'user-1',
  display_name: 'Mama Ngozi Kitchen',
  bio: 'Authentic Nigerian food',
  avatar_url: null,
  banner_url: null,
  cuisine_tags: ['Nigerian', 'African'],
  avg_rating: 4.8,
  total_reviews: 42,
  is_open: true,
  service_radius_km: 10,
  lat: 40.6782,
  lng: -73.9442,
  prep_time_mins: 30,
  distance_km: 2.5,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

describe('MakerCard', () => {
  it('renders maker name', () => {
    render(<MakerCard maker={makeMaker()} />)
    expect(screen.getByText('Mama Ngozi Kitchen')).toBeInTheDocument()
  })

  it('renders cuisine tags', () => {
    render(<MakerCard maker={makeMaker()} />)
    expect(screen.getByText('Nigerian')).toBeInTheDocument()
    expect(screen.getByText('African')).toBeInTheDocument()
  })

  it('renders rating', () => {
    render(<MakerCard maker={makeMaker()} />)
    expect(screen.getByText('4.8')).toBeInTheDocument()
  })

  it('shows Open badge when is_open is true', () => {
    render(<MakerCard maker={makeMaker({ is_open: true })} />)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('shows Closed badge when is_open is false', () => {
    render(<MakerCard maker={makeMaker({ is_open: false })} />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('renders distance when provided', () => {
    render(<MakerCard maker={makeMaker({ distance_km: 3.2 })} />)
    expect(screen.getByText('3.2km')).toBeInTheDocument()
  })

  it('renders avatar placeholder when no avatar_url', () => {
    render(<MakerCard maker={makeMaker({ avatar_url: null })} />)
    expect(screen.getByText('M')).toBeInTheDocument() // first letter of display name
  })

  it('links to the correct maker page', () => {
    render(<MakerCard maker={makeMaker({ id: 'maker-abc' })} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/maker/maker-abc')
  })
})

'use client'

import { useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'

export default function AddressesPage() {
  const [adding, setAdding] = useState(false)
  const [newAddress, setNewAddress] = useState('')

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Saved Addresses" />

      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl">
          <MapPin size={40} className="text-gray-200 mb-3" />
          <h3 className="font-bold text-gray-700">No saved addresses</h3>
          <p className="text-sm text-gray-400 mt-1">Add your home or work address for faster checkout</p>
        </div>

        {adding ? (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <input
              autoFocus
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Enter your address"
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setAdding(false); setNewAddress('') }} className="flex-1">
                Cancel
              </Button>
              <Button disabled={!newAddress.trim()} className="flex-1">
                Save Address
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 justify-center"
          >
            <Plus size={16} />
            Add New Address
          </Button>
        )}
      </div>
    </div>
  )
}

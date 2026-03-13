'use client'

export function RefundButton({ orderId }: { orderId: string }) {
  return (
    <form action="/api/admin/refund" method="POST">
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors"
        onClick={(e) => {
          if (!confirm('Issue a full refund for this order?')) e.preventDefault()
        }}
      >
        Refund
      </button>
    </form>
  )
}

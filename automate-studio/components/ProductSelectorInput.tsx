import React, {useCallback, useEffect, useId, useState} from 'react'
import {StringInputProps, set, unset, useClient, useFormValue} from 'sanity'
import {Box, Card, Flex, Select, Spinner, Stack, Text, ToastProvider, useToast} from '@sanity/ui'
import {fetchActiveProducts, LmsProduct} from '../lib/supabase'

/**
 * ProductSelectorInput
 * ─────────────────────
 * Custom string input that replaces the plain text field for `productUuid`
 * inside the `courseDetails` document type.
 *
 * Behaviour:
 *  - On mount, fetches all active products from public.products via Supabase.
 *  - Renders a <Select> (native HTML select, styled by @sanity/ui) showing
 *    each product's title. If a thumbnail_url is available it is shown as a
 *    small avatar beside the title using an <img> tag.
 *  - On selection, stores the product_uuid in the Sanity field value.
 *  - Automatically downloads the thumbnail and uploads it to Sanity as the `heroImage`!
 */
export function ProductSelectorInput(props: StringInputProps) {
  const {onChange, value, readOnly} = props

  const [products, setProducts] = useState<LmsProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const uid = useId()
  const client = useClient({apiVersion: '2023-01-01'})
  const documentId = useFormValue(['_id']) as string | undefined
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchActiveProducts()
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message ?? 'Failed to load products')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = e.currentTarget.value
      // Immediately set the productUuid value
      onChange(selectedId ? set(selectedId) : unset())

      // If a product is selected, try to auto-populate heroImage
      if (selectedId && documentId) {
        const product = products.find((p) => p.id === selectedId)
        if (product?.thumbnail_url) {
          setIsUploading(true)
          try {
            const res = await fetch(product.thumbnail_url)
            const blob = await res.blob()
            const asset = await client.assets.upload('image', blob, {
              filename: `${product.title}-thumbnail`,
            })
            
            // Determine the actual document ID to patch (handle drafts)
            const targetId = documentId.startsWith('drafts.') ? documentId : `drafts.${documentId}`
            
            await client.patch(targetId).setIfMissing({heroImage: {}}).set({
              heroImage: {
                _type: 'image',
                asset: {
                  _type: 'reference',
                  _ref: asset._id,
                },
              },
            }).commit()
            
            toast.push({
              status: 'success',
              title: 'Thumbnail auto-populated!',
              description: 'The Hero Image was updated successfully.'
            })
          } catch (err) {
            console.error('Failed to auto-upload thumbnail to heroImage', err)
            toast.push({
              status: 'error',
              title: 'Failed to auto-populate thumbnail',
              description: err instanceof Error ? err.message : 'Unknown error'
            })
          } finally {
            setIsUploading(false)
          }
        }
      }
    },
    [onChange, products, documentId, client, toast],
  )

  /* ── Loading state ── */
  if (loading) {
    return (
      <Card padding={3} radius={2} tone="transparent">
        <Flex align="center" gap={3}>
          <Spinner muted />
          <Text muted size={1}>
            Loading courses from Learning Portal…
          </Text>
        </Flex>
      </Card>
    )
  }

  /* ── Error state ── */
  if (error) {
    return (
      <Card padding={3} radius={2} tone="caution">
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Could not load courses
          </Text>
          <Text muted size={1}>
            {error}
          </Text>
          <Text muted size={1}>
            Make sure SANITY_STUDIO_SUPABASE_URL and SANITY_STUDIO_SUPABASE_ANON_KEY are set.
          </Text>
        </Stack>
      </Card>
    )
  }

  /* ── Empty state ── */
  if (products.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent">
        <Text muted size={1}>
          No courses found in the Learning Portal.
        </Text>
      </Card>
    )
  }

  /* ── Selected product preview ── */
  const selectedProduct = products.find((p) => p.id === value) ?? null

  return (
    <Stack space={3}>
      {/* Dropdown */}
      <Select
        id={uid}
        value={value ?? ''}
        onChange={handleChange}
        disabled={readOnly}
        fontSize={2}
        padding={3}
        radius={2}
      >
        <option value="">— Select an LMS course —</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.title}
          </option>
        ))}
      </Select>

      {/* Selected product preview card */}
      {selectedProduct && (
        <Card padding={3} radius={2} shadow={1}>
          <Flex align="center" gap={3}>
            {selectedProduct.thumbnail_url && (
              /* Plain <img> — this runs in Studio, not the Next.js app */
              /* eslint-disable-next-line @next/next/no-img-element */
              <Box style={{ position: 'relative' }}>
                <img
                  src={selectedProduct.thumbnail_url}
                  alt={selectedProduct.title}
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: 'cover',
                    borderRadius: 6,
                    flexShrink: 0,
                    opacity: isUploading ? 0.5 : 1,
                  }}
                />
                {isUploading && (
                  <Box style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    <Spinner muted />
                  </Box>
                )}
              </Box>
            )}
            <Box>
              <Text size={2} weight="semibold">
                {selectedProduct.title}
              </Text>
              <Text muted size={1} style={{marginTop: 4}}>
                Course ID: {selectedProduct.id}
              </Text>
            </Box>
          </Flex>
        </Card>
      )}
    </Stack>
  )
}

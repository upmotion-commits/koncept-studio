'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { IconSearch } from '@tabler/icons-react'

export interface ColumnDefinition<T> {
  key: keyof T | string
  header: string
  render?: (item: T) => React.ReactNode
  cell?: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

export interface ActionDefinition<T> {
  label: string
  onClick: (item: T) => void
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  disabled?: (item: T) => boolean
  icon?: React.ComponentType<{ className?: string }>
}

export interface DataTableProps<T> {
  title?: string
  description?: string
  data: T[]
  columns: ColumnDefinition<T>[]
  actions?: ActionDefinition<T>[]
  loading?: boolean
  emptyMessage?: string
  className?: string
  keyExtractor?: (item: T) => string
  searchKey?: string
  searchPlaceholder?: string
  pageSize?: number
}

export function DataTable<T>({
  title,
  description,
  data,
  columns,
  actions = [],
  loading = false,
  emptyMessage = "Aucun élément trouvé",
  className = "",
  keyExtractor,
  searchKey,
  searchPlaceholder = "Rechercher...",
  pageSize = 10
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const getValue = (item: T, key: keyof T | string): any => {
    if (typeof key === 'string' && key.includes('.')) {
      return key.split('.').reduce((obj, k) => obj?.[k], item as any)
    }
    return item[key as keyof T]
  }

  // Filter data based on search term
  const filteredData = searchKey && searchTerm
    ? data.filter(item => {
        const searchValue = getValue(item, searchKey)
        return searchValue?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      })
    : data

  // Paginate filtered data
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize)

  // Auto-generate keyExtractor if not provided
  const getItemKey = keyExtractor || ((item: any, index: number) => item.id || index.toString())

  if (loading) {
    return (
      <Card className={className}>
        {title && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </CardHeader>
      )}
      <CardContent>
        {/* Search */}
        {searchKey && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[12rem] sm:max-w-sm">
              <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9"
              />
            </div>
            {filteredData.length !== data.length && (
              <Badge variant="secondary">
                {filteredData.length} résultat{filteredData.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        )}

        {filteredData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {columns.map((column, index) => (
                      <th
                        key={`header-${index}`}
                        className={`text-left py-3 px-4 font-medium text-sm text-muted-foreground ${column.className || ''}`}
                      >
                        {column.header}
                      </th>
                    ))}
                    {actions.length > 0 && (
                      <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((item, rowIndex) => (
                    <tr key={getItemKey(item, rowIndex)} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      {columns.map((column, colIndex) => (
                        <td key={`cell-${rowIndex}-${colIndex}`} className={`py-3 px-4 ${column.className || ''}`}>
                          {column.cell ? column.cell(item) :
                           column.render ? column.render(item) :
                           String(getValue(item, column.key) || '-')}
                        </td>
                      ))}
                      {actions.length > 0 && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {actions.map((action, actionIndex) => {
                              const isDisabled = action.disabled ? action.disabled(item) : false
                              const IconComponent = action.icon

                              return (
                                <Button
                                  key={`action-${actionIndex}`}
                                  size="sm"
                                  variant={action.variant || 'outline'}
                                  onClick={() => action.onClick(item)}
                                  disabled={isDisabled}
                                >
                                  {IconComponent && <IconComponent className="w-4 h-4 mr-1" />}
                                  {action.label}
                                </Button>
                              )
                            })}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>
                    Affichage {startIndex + 1}-{Math.min(startIndex + pageSize, filteredData.length)} sur {filteredData.length}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} sur {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default DataTable
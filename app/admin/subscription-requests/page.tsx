'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  IconSearch,
  IconFilter,
  IconX,
  IconRefresh,
  IconUserPlus,
  IconCheck,
  IconClock,
  IconUser,
  IconAlertTriangle,
  IconEye,
  IconActivity,
  IconFileText,
  IconDownload,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconTags,
  IconTrash
} from '@tabler/icons-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { getAdminSubscriptionRequests, updateSubscriptionRequest, assignSubscriptionToUser, deleteSubscriptionRequest, type AdminSubscriptionRequest, type RequestStats } from './actions'
import * as XLSX from 'xlsx'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

export default function AdminSubscriptionRequestsPage() {
  const [requests, setRequests] = useState<AdminSubscriptionRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<AdminSubscriptionRequest[]>([])
  const [stats, setStats] = useState<RequestStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<AdminSubscriptionRequest | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showSubscriptionTypeFilter, setShowSubscriptionTypeFilter] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [requestToDelete, setRequestToDelete] = useState<AdminSubscriptionRequest | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [subscriptionTypeFilter, setSubscriptionTypeFilter] = useState<string[]>([])

  // Get unique subscription types from requests
  const availableSubscriptionTypes = Array.from(
    new Set(requests.map(req => req.planName))
  ).sort()

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300) // 300ms delay

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Assign form data
  const [assignData, setAssignData] = useState({
    startDate: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
  })

  const filterRequests = useCallback(() => {
    // Start by showing only pending requests
    let filtered = requests.filter(req => req.status === 'pending')

    if (debouncedSearchTerm) {
      const searchTermLower = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter(req =>
        req.userName.toLowerCase().includes(searchTermLower) ||
        req.userEmail.toLowerCase().includes(searchTermLower) ||
        (req.userPhone && req.userPhone.toLowerCase().includes(searchTermLower)) ||
        req.planName.toLowerCase().includes(searchTermLower)
      )
    }

    if (subscriptionTypeFilter.length > 0) {
      filtered = filtered.filter(req =>
        subscriptionTypeFilter.includes(req.planName)
      )
    }

    setFilteredRequests(filtered)
  }, [requests, debouncedSearchTerm, subscriptionTypeFilter])

  useEffect(() => {
    loadRequests()
  }, [])

  useEffect(() => {
    filterRequests()
    setCurrentPage(1) // Reset to first page when filters change
  }, [filterRequests])

  // Calculate pagination values
  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleExport = () => {
    try {
      const dataToExport = filteredRequests.map(request => ({
        'Nom': request.userName,
        'Email': request.userEmail,
        'Plan': request.planName,
        'Type': getTypeInfo(request.requestType).label,
        'Prix': `${request.planPrice} DHS`,
        'Statut': getStatusInfo(request.status).label,
        'Date de création': format(new Date(request.createdAt), 'dd/MM/yyyy HH:mm', { locale: fr }),
        'Date d\'expiration': format(new Date(request.expiresAt), 'dd/MM/yyyy HH:mm', { locale: fr }),
        'Notes admin': request.adminNotes || ''
      }))

      const ws = XLSX.utils.json_to_sheet(dataToExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Demandes d\'abonnement')

      // Auto-adjust column widths
      const colWidths = [
        { wch: 20 }, // Nom
        { wch: 25 }, // Email
        { wch: 15 }, // Plan
        { wch: 15 }, // Type
        { wch: 10 }, // Prix
        { wch: 12 }, // Statut
        { wch: 18 }, // Date de création
        { wch: 18 }, // Date d'expiration
        { wch: 30 }  // Notes admin
      ]
      ws['!cols'] = colWidths

      const fileName = `demandes-abonnement-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success(`Export réalisé: ${fileName}`)
    } catch (error) {
      console.error('Error exporting:', error)
      toast.error('Erreur lors de l\'export')
    }
  }

  const loadRequests = async () => {
    try {
      setIsLoading(true)

      const result = await getAdminSubscriptionRequests()

      if (result.success && result.data) {
        setRequests(result.data.requests)
        setStats(result.data.stats)
      } else {
        toast.error(result.error || 'Erreur lors du chargement des demandes')
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des demandes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubscriptionTypeToggle = (subscriptionType: string) => {
    setSubscriptionTypeFilter(prev =>
      prev.includes(subscriptionType)
        ? prev.filter(type => type !== subscriptionType)
        : [...prev, subscriptionType]
    )
  }

  const getStatusInfo = (status: string) => {
    const configs = {
      pending: { label: 'En attente', color: 'bg-muted text-muted-foreground' },
      contacted: { label: 'Contacté', color: 'bg-muted text-foreground' },
      approved: { label: 'Approuvé', color: 'bg-foreground text-background' },
      fulfilled: { label: 'Réalisé', color: 'bg-foreground text-background' },
      cancelled: { label: 'Annulé', color: 'bg-muted text-muted-foreground' },
      expired: { label: 'Expiré', color: 'bg-muted text-muted-foreground' }
    }
    return configs[status as keyof typeof configs] || { label: status, color: 'bg-muted text-muted-foreground' }
  }

  const getTypeInfo = (type: string) => {
    const configs = {
      new: { label: 'Nouvelle demande' },
      renewal: { label: 'Renouvellement' },
      upgrade: { label: 'Mise à niveau' },
      additional: { label: 'Supplémentaire' }
    }
    return configs[type as keyof typeof configs] || { label: type }
  }


  const isExpiringSoon = (expiresAt: string) => {
    const expiry = new Date(expiresAt)
    const now = new Date()
    const diffTime = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 3 && diffDays > 0
  }


  const handleAssignRequest = (request: AdminSubscriptionRequest) => {
    setSelectedRequest(request)
    setAssignData({
      startDate: new Date().toISOString().split('T')[0]
    })
    setShowAssignModal(true)
  }

  const handleSaveAssignment = async () => {
    if (!selectedRequest) return

    try {
      const result = await assignSubscriptionToUser(selectedRequest.id, {
        startDate: assignData.startDate
      })

      if (result.success) {
        toast.success('Abonnement assigné avec succès')
        setShowAssignModal(false)
        loadRequests()
      } else {
        toast.error(result.error || 'Erreur lors de l\'assignation')
      }
    } catch (error) {
      toast.error('Erreur lors de l\'assignation')
    }
  }

  const handleShowDeleteConfirmation = (request: AdminSubscriptionRequest) => {
    setRequestToDelete(request)
    setShowDeleteConfirmation(true)
  }

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return

    try {
      const result = await deleteSubscriptionRequest(requestToDelete.id)

      if (result.success) {
        toast.success('Demande supprimée avec succès')
        setShowDeleteConfirmation(false)
        setRequestToDelete(null)
        loadRequests()
      } else {
        toast.error(result.error || 'Erreur lors de la suppression')
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression')
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-4">Chargement des demandes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Demandes d'abonnement</h1>
          <p className="text-muted-foreground">
            Gérez et suivez les demandes d'abonnement en attente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            disabled={filteredRequests.length === 0}
          >
            <IconDownload className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button onClick={loadRequests} variant="outline" size="sm">
            <IconRefresh className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <IconFileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <IconClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Traités</CardTitle>
              <IconCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fulfilled}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taux conversion</CardTitle>
              <IconActivity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.conversionRate}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email, téléphone ou plan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Subscription Type Filter */}
            <Dialog open={showSubscriptionTypeFilter} onOpenChange={setShowSubscriptionTypeFilter}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-between"
                  disabled={availableSubscriptionTypes.length === 0}
                >
                  <div className="flex items-center gap-2">
                    <IconTags className="h-4 w-4" />
                    {subscriptionTypeFilter.length === 0
                      ? "Types d'abonnement"
                      : `${subscriptionTypeFilter.length} sélectionné${subscriptionTypeFilter.length > 1 ? 's' : ''}`
                    }
                  </div>
                  <IconChevronDown className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Types d'abonnement</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableSubscriptionTypes.map(type => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type}
                          checked={subscriptionTypeFilter.includes(type)}
                          onCheckedChange={() => handleSubscriptionTypeToggle(type)}
                        />
                        <Label htmlFor={type} className="text-sm font-normal cursor-pointer flex-1">
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {subscriptionTypeFilter.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSubscriptionTypeFilter([])}
                        className="flex-1"
                      >
                        Tout désélectionner
                      </Button>
                    )}
                    <Button
                      onClick={() => setShowSubscriptionTypeFilter(false)}
                      className="flex-1"
                    >
                      Fermer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('')
                setDebouncedSearchTerm('')
                setSubscriptionTypeFilter([])
              }}
            >
              <IconX className="h-4 w-4 mr-2" />
              Effacer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Demandes en attente ({filteredRequests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paginatedRequests.map((request) => {
              const statusInfo = getStatusInfo(request.status)
              const typeInfo = getTypeInfo(request.requestType)
              const expiringSoon = isExpiringSoon(request.expiresAt)

              return (
                <Card key={request.id} className={`transition-all hover:shadow-md ${expiringSoon ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-lg break-words">{request.userName}</h4>
                          <Badge variant="outline" className={statusInfo.color}>
                            {statusInfo.label}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {typeInfo.label}
                          </Badge>
                          {expiringSoon && (
                            <Badge variant="destructive" className="text-xs">
                              <IconAlertTriangle className="h-3 w-3 mr-1" />
                              Expire bientôt
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Plan:</span>
                            <div className="font-medium">{request.planName}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Prix:</span>
                            <div className="font-medium">{request.planPrice} DHS</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <div className="font-medium text-xs break-words">{request.userEmail}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {request.userPhone ? 'Téléphone:' : 'Créé le:'}
                            </span>
                            <div className="font-medium">
                              {request.userPhone || format(new Date(request.createdAt), 'dd/MM/yyyy', { locale: fr })}
                            </div>
                          </div>
                        </div>

                        {request.userPhone && (
                          <div className="text-sm pt-2 border-t border-muted">
                            <span className="text-muted-foreground">Créé le:</span>
                            <span className="font-medium ml-2">
                              {format(new Date(request.createdAt), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                          </div>
                        )}

                      </div>

                      <div className="flex shrink-0 gap-2 border-t pt-3 sm:border-0 sm:pt-0 sm:ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 w-11 sm:h-9 sm:w-9 p-0"
                          onClick={() => {
                            setSelectedRequest(request)
                            setShowDetailsModal(true)
                          }}
                          title="Voir les détails"
                        >
                          <IconEye className="h-4 w-4" />
                          <span className="sr-only">Voir les détails</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 w-11 sm:h-9 sm:w-9 p-0"
                          onClick={() => handleAssignRequest(request)}
                          disabled={request.status === 'fulfilled'}
                          title={request.status === 'fulfilled' ? 'Déjà traité' : 'Assigner abonnement'}
                        >
                          <IconUserPlus className="h-4 w-4" />
                          <span className="sr-only">Assigner un abonnement</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-11 w-11 sm:h-9 sm:w-9 p-0"
                          onClick={() => handleShowDeleteConfirmation(request)}
                          disabled={request.status === 'fulfilled'}
                          title={request.status === 'fulfilled' ? 'Impossible de supprimer une demande traitée' : 'Supprimer la demande'}
                        >
                          <IconTrash className="h-4 w-4" />
                          <span className="sr-only">Supprimer la demande</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {filteredRequests.length === 0 && (
              <div className="text-center py-12">
                <IconFileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucune demande trouvée</h3>
                <p className="text-muted-foreground">
                  {debouncedSearchTerm || subscriptionTypeFilter.length > 0
                    ? "Aucune demande en attente ne correspond aux filtres sélectionnés."
                    : "Aucune demande d'abonnement en attente pour le moment."
                  }
                </p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-6 border-t">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} sur {totalPages} •
                Affichage de {startIndex + 1}-{Math.min(endIndex, filteredRequests.length)} sur {filteredRequests.length} résultat{filteredRequests.length !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="gap-2"
                >
                  <IconChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="gap-2"
                >
                  Suivant
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails de la demande</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Utilisateur</Label>
                  <p className="font-medium">{selectedRequest.userName}</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <p className="font-medium text-sm break-all">{selectedRequest.userEmail}</p>
                </div>
                {selectedRequest.userPhone && (
                  <div>
                    <Label>Téléphone</Label>
                    <p className="font-medium">{selectedRequest.userPhone}</p>
                  </div>
                )}
                <div>
                  <Label>Plan</Label>
                  <p className="font-medium">{selectedRequest.planName}</p>
                </div>
                <div>
                  <Label>Type</Label>
                  <p className="font-medium">{selectedRequest.planType}</p>
                </div>
                <div>
                  <Label>Prix</Label>
                  <p className="font-medium">{selectedRequest.planPrice} DHS</p>
                </div>
              </div>


              {selectedRequest.adminNotes && (
                <div>
                  <Label>Notes admin</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md">{selectedRequest.adminNotes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Subscription Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner un abonnement</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Utilisateur:</span>
                    <div className="font-medium">{selectedRequest.userName}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plan:</span>
                    <div className="font-medium">{selectedRequest.planName}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <div className="font-medium">{selectedRequest.planType}</div>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="startDate">Date de début</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={assignData.startDate}
                  onChange={(e) => setAssignData(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAssignModal(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSaveAssignment}>
                  Assigner l'abonnement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la demande d'abonnement de <strong>{requestToDelete?.userName}</strong> pour le plan <strong>{requestToDelete?.planName}</strong> ?
            </AlertDialogDescription>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Cette action est irréversible. La demande sera définitivement supprimée de la base de données.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteConfirmation(false)
              setRequestToDelete(null)
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRequest}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
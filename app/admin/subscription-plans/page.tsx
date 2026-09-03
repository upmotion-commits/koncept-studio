'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface SubscriptionPlan {
  id: string
  name: string
  type: 'carnet' | 'personal_training' | 'abonnement'
  credits: number
  price_dhs: number
  validity_months: number
  weekly_limit?: number | null
  created_at: string
  updated_at: string
}

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [planToDelete, setPlanToDelete] = useState<{ id: string; name: string } | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    name: '',
    type: 'carnet' as 'carnet' | 'personal_training' | 'abonnement',
    credits: '',
    price_dhs: '',
    validity_months: '',
    weekly_limit: ''
  })

  const fetchPlans = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('type', { ascending: true })
        .order('price_dhs', { ascending: true })

      if (error) {
        console.error('Database error:', error)
        throw error
      }
      setPlans(data || [])
    } catch (err: any) {
      console.error('Error fetching plans:', err)
      setError(`Erreur lors du chargement des plans: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear irrelevant fields when subscription type changes
  useEffect(() => {
    if (formData.type === 'abonnement') {
      setFormData(prev => ({ ...prev, credits: '' }))
    } else {
      setFormData(prev => ({ ...prev, weekly_limit: '' }))
    }
  }, [formData.type])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'carnet',
      credits: '',
      price_dhs: '',
      validity_months: '',
      weekly_limit: ''
    })
    setEditingPlan(null)
  }

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan)
    setFormData({
      name: plan.name,
      type: plan.type,
      credits: plan.credits.toString(),
      price_dhs: plan.price_dhs.toString(),
      validity_months: plan.validity_months.toString(),
      weekly_limit: plan.weekly_limit?.toString() || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate required fields based on subscription type
    if (formData.type !== 'abonnement' && !formData.credits) {
      setError('Le nombre de crédits est requis pour ce type d\'abonnement')
      setLoading(false)
      return
    }

    if (formData.type === 'abonnement' && !formData.weekly_limit) {
      setError('La limite hebdomadaire est requise pour les abonnements')
      setLoading(false)
      return
    }

    const planData = {
      name: formData.name,
      type: formData.type,
      credits: formData.type !== 'abonnement' ? parseInt(formData.credits) : 0,
      price_dhs: parseInt(formData.price_dhs),
      validity_months: parseInt(formData.validity_months),
      weekly_limit: formData.type === 'abonnement' ? parseInt(formData.weekly_limit) : null
    }

    try {
      await toast.promise(
        async () => {
          if (editingPlan) {
            const { error } = await supabase
              .from('subscription_plans')
              .update(planData)
              .eq('id', editingPlan.id)

            if (error) throw error
          } else {
            const { error } = await supabase
              .from('subscription_plans')
              .insert([planData])

            if (error) throw error
          }

          await fetchPlans()
          setShowForm(false)
          resetForm()
        },
        {
          loading: editingPlan ? 'Modification en cours...' : 'Création en cours...',
          success: editingPlan 
            ? `Le forfait "${formData.name}" a été modifié avec succès`
            : `Le forfait "${formData.name}" a été créé avec succès`,
          error: editingPlan 
            ? 'Erreur lors de la modification du forfait'
            : 'Erreur lors de la création du forfait'
        }
      )
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (planId: string, planName: string) => {
    setPlanToDelete({ id: planId, name: planName })
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!planToDelete) return
    
    setShowDeleteDialog(false)
    
    toast.promise(
      async () => {
        const { error } = await supabase
          .from('subscription_plans')
          .delete()
          .eq('id', planToDelete.id)

        if (error) throw error
        await fetchPlans()
      },
      {
        loading: 'Suppression en cours...',
        success: `Le forfait "${planToDelete.name}" a été supprimé avec succès`,
        error: 'Erreur lors de la suppression du forfait'
      }
    )
    
    setPlanToDelete(null)
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'carnet': return 'Carnet'
      case 'personal_training': return 'Coaching Personnel'
      case 'abonnement': return 'Abonnement'
      default: return type
    }
  }


  if (loading && plans.length === 0) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Forfaits</h1>
            <p className="text-muted-foreground mt-2">
              Gérer les formules d'abonnement et les tarifs
            </p>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chargement des forfaits...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Forfaits</h1>
          <p className="text-muted-foreground mt-2">
            Gérer les formules d'abonnement et les tarifs
          </p>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <IconPlus size={16} className="mr-2" />
              Nouveau Forfait
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPlan ? 'Modifier le Forfait' : 'Nouveau Forfait'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du Forfait</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="carnet">Carnet</SelectItem>
                      <SelectItem value="personal_training">Coaching Personnel</SelectItem>
                      <SelectItem value="abonnement">Abonnement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price_dhs">Prix (DHS)</Label>
                  <Input
                    id="price_dhs"
                    type="number"
                    value={formData.price_dhs}
                    onChange={(e) => handleInputChange('price_dhs', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validity_months">Validité (mois)</Label>
                  <Input
                    id="validity_months"
                    type="number"
                    value={formData.validity_months}
                    onChange={(e) => handleInputChange('validity_months', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Dynamic fields based on subscription type */}
              {formData.type !== 'abonnement' && (
                <div className="space-y-2">
                  <Label htmlFor="credits">Crédits</Label>
                  <Input
                    id="credits"
                    type="number"
                    value={formData.credits}
                    onChange={(e) => handleInputChange('credits', e.target.value)}
                    required
                  />
                </div>
              )}

              {formData.type === 'abonnement' && (
                <div className="space-y-2">
                  <Label htmlFor="weekly_limit">Limite Hebdomadaire</Label>
                  <Input
                    id="weekly_limit"
                    type="number"
                    value={formData.weekly_limit}
                    onChange={(e) => handleInputChange('weekly_limit', e.target.value)}
                    placeholder="Séances par semaine"
                    required
                  />
                </div>
              )}


              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Sauvegarde...' : editingPlan ? 'Modifier' : 'Créer un Forfait'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {plans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">Aucun forfait trouvé</h3>
            <p className="text-muted-foreground">
              Créez votre premier forfait pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Prix</TableHead>
                  <TableHead className="hidden md:table-cell">Crédits</TableHead>
                  <TableHead className="hidden lg:table-cell">Durée</TableHead>
                  <TableHead className="hidden lg:table-cell">Crédits/Semaine</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.name}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">
                        {getTypeLabel(plan.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {plan.price_dhs} DHS
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-medium">
                        {plan.type === 'abonnement' ? 'Illimité' : plan.credits}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="font-medium">
                        {plan.validity_months} mois
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {plan.weekly_limit ? (
                        <span className="font-medium">
                          {plan.weekly_limit} crédits
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Aucune limite</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(plan)}
                        >
                          <IconEdit size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(plan.id, plan.name)}
                        >
                          <IconTrash size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le forfait "{planToDelete?.name}" ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
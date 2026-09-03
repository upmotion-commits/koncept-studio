'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'

interface ClassItem {
  id: string
  title: string
  coach: string
  description: string
  duration: number
  location: string
  difficulty_level: 'all_levels' | 'intermediate' | 'advanced'
  max_capacity: number
  created_at: string
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [classToDelete, setClassToDelete] = useState<{ id: string; title: string } | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    title: '',
    coach: '',
    description: '',
    duration: '',
    location: '',
    difficulty_level: 'all_levels' as 'all_levels' | 'intermediate' | 'advanced',
    max_capacity: ''
  })

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setClasses(data || [])
    } catch (err: any) {
      console.error('Error fetching classes:', err)
      setError(`Erreur lors du chargement des cours: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setFormData({
      title: '',
      coach: '',
      description: '',
      duration: '',
      location: '',
      difficulty_level: 'all_levels',
      max_capacity: ''
    })
    setEditingClass(null)
  }

  const handleEdit = (classItem: ClassItem) => {
    setEditingClass(classItem)
    setFormData({
      title: classItem.title,
      coach: classItem.coach,
      description: classItem.description,
      duration: classItem.duration.toString(),
      location: classItem.location,
      difficulty_level: classItem.difficulty_level,
      max_capacity: classItem.max_capacity.toString()
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate form data
    if (!formData.title.trim() || !formData.coach.trim() || !formData.duration || !formData.max_capacity || !formData.location.trim()) {
      setError('Tous les champs obligatoires doivent être remplis')
      setLoading(false)
      return
    }

    const classData = {
      title: formData.title.trim(),
      coach: formData.coach.trim(),
      description: formData.description.trim() || null,
      duration: parseInt(formData.duration),
      location: formData.location.trim(),
      difficulty_level: formData.difficulty_level,
      max_capacity: parseInt(formData.max_capacity)
    }

    try {
      const result = await (editingClass ? 
        supabase.from('classes').update(classData).eq('id', editingClass.id) :
        supabase.from('classes').insert([classData])
      )

      if (result.error) {
        console.error('Database error:', result.error)
        setError(`Erreur base de données: ${result.error.message}`)
        return
      }

      // Success
      await fetchClasses()
      setShowForm(false)
      resetForm()
      
      toast.success(editingClass 
        ? `Le cours "${formData.title}" a été modifié avec succès`
        : `Le cours "${formData.title}" a été créé avec succès`
      )

    } catch (err: any) {
      console.error('Unexpected error:', err)
      setError(`Erreur inattendue: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (classId: string, classTitle: string) => {
    setClassToDelete({ id: classId, title: classTitle })
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!classToDelete) return
    
    setShowDeleteDialog(false)
    
    toast.promise(
      async () => {
        const { error } = await supabase
          .from('classes')
          .delete()
          .eq('id', classToDelete.id)

        if (error) throw error
        await fetchClasses()
      },
      {
        loading: 'Suppression en cours...',
        success: `Le cours "${classToDelete.title}" a été supprimé avec succès`,
        error: 'Erreur lors de la suppression du cours'
      }
    )
    
    setClassToDelete(null)
  }

  const getDifficultyVariant = (): 'secondary' => {
    return 'secondary'
  }

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'all_levels': return 'Tous niveaux'
      case 'intermediate': return 'Intermédiaire'
      case 'advanced': return 'Avancé'
      default: return difficulty
    }
  }

  if (loading && classes.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Cours</h1>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chargement des cours...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Cours</h1>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <IconPlus size={16} className="mr-2" />
              Nouveau Cours
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingClass ? 'Modifier le Cours' : 'Nouveau Cours'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titre du Cours</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="coach">Coach</Label>
                  <Input
                    id="coach"
                    value={formData.coach}
                    onChange={(e) => handleInputChange('coach', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Description du cours..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Durée (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration}
                    onChange={(e) => handleInputChange('duration', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_capacity">Capacité Max</Label>
                  <Input
                    id="max_capacity"
                    type="number"
                    value={formData.max_capacity}
                    onChange={(e) => handleInputChange('max_capacity', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty_level">Difficulté</Label>
                  <Select value={formData.difficulty_level} onValueChange={(value) => handleInputChange('difficulty_level', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_levels">Tous niveaux</SelectItem>
                      <SelectItem value="intermediate">Intermédiaire</SelectItem>
                      <SelectItem value="advanced">Avancé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Lieu</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  required
                />
              </div>



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
                  {loading ? 'Sauvegarde...' : editingClass ? 'Modifier' : 'Créer le Cours'}
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

      {classes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">Aucun cours trouvé</h3>
            <p className="text-muted-foreground">
              Créez votre premier cours pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead className="hidden md:table-cell">Coach</TableHead>
                  <TableHead className="hidden lg:table-cell">Durée</TableHead>
                  <TableHead className="hidden lg:table-cell">Lieu</TableHead>
                  <TableHead className="hidden md:table-cell">Difficulté</TableHead>
                  <TableHead>Capacité</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classItem) => (
                  <TableRow key={classItem.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{classItem.title}</div>
                        {classItem.description && (
                          <div className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-[16rem]">
                            {classItem.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-medium">{classItem.coach}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="font-medium">{classItem.duration} min</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="font-medium">{classItem.location}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">
                        {getDifficultyLabel(classItem.difficulty_level)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{classItem.max_capacity}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(classItem)}
                        >
                          <IconEdit size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(classItem.id, classItem.title)}
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
              Êtes-vous sûr de vouloir supprimer le cours "{classToDelete?.title}" ?
              Cette action est irréversible et supprimera également toutes les réservations associées.
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
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { getAdminSettings, updateAdminSettings, resetSettingsToDefault, exportSettings } from './actions'
import { SettingsService, AdminSetting, SettingsGroup, SettingValue } from '@/lib/services/settings.service'
import {
  IconSettings,
  IconBuildingStore,
  IconPalette,
  IconShield,
  IconMessage,
  IconFileText,
  IconGlobe,
  IconDeviceFloppy,
  IconRefresh,
  IconDownload,
  IconLoader2
} from '@tabler/icons-react'

interface SettingsFormData {
  [key: string]: SettingValue
}

export default function AdminSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [settingsGroups, setSettingsGroups] = useState<SettingsGroup[]>([])
  const [formData, setFormData] = useState<SettingsFormData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState('')

  const checkAdminAccess = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user!.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }

      // User is admin, load settings
      await loadSettings()
    } catch (err) {
      console.error('Error checking admin access:', err)
      router.push('/')
    }
  }, [user, router, supabase])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/login')
      return
    }

    // Check if user is admin
    checkAdminAccess()
  }, [user, authLoading, router, checkAdminAccess])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError('')
      const groups = await getAdminSettings()
      setSettingsGroups(groups)

      // Initialize form data
      const initialData: SettingsFormData = {}
      groups.forEach(group => {
        group.settings.forEach(setting => {
          initialData[setting.key] = setting.value
        })
      })
      setFormData(initialData)
    } catch (error) {
      console.error('Error loading settings:', error)
      setError('Erreur lors du chargement des paramètres')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (key: string, value: SettingValue) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const result = await updateAdminSettings({ updates: formData })

      if (result.success) {
        toast.success('Paramètres mis à jour avec succès')
        setHasChanges(false)
        // Reload settings to ensure consistency
        await loadSettings()
      } else {
        toast.error(result.error || 'Erreur lors de la mise à jour')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres aux valeurs par défaut ?')) {
      return
    }

    try {
      setResetting(true)
      const result = await resetSettingsToDefault()

      if (result.success) {
        toast.success('Paramètres réinitialisés avec succès')
        await loadSettings()
        setHasChanges(false)
      } else {
        toast.error(result.error || 'Erreur lors de la réinitialisation')
      }
    } catch (error) {
      console.error('Error resetting settings:', error)
      toast.error('Erreur lors de la réinitialisation')
    } finally {
      setResetting(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const result = await exportSettings()

      if (result.success) {
        // Download as JSON file
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `koncept-studio-settings-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success('Paramètres exportés avec succès')
      } else {
        toast.error(result.error || 'Erreur lors de l\'export')
      }
    } catch (error) {
      console.error('Error exporting settings:', error)
      toast.error('Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  const renderSettingInput = (setting: AdminSetting) => {
    const value = formData[setting.key]
    const displayName = SettingsService.getSettingDisplayName(setting.key)

    switch (setting.data_type) {
      case 'boolean':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={setting.key} className="text-sm font-medium">
                {displayName}
                {setting.is_required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Switch
                id={setting.key}
                checked={Boolean(value)}
                onCheckedChange={(checked) => handleInputChange(setting.key, checked)}
              />
            </div>
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )

      case 'number':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key} className="text-sm font-medium">
              {displayName}
              {setting.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={setting.key}
              type="number"
              value={Number(value) || ''}
              onChange={(e) => handleInputChange(setting.key, Number(e.target.value))}
              placeholder={setting.description}
              className="max-w-xs"
            />
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )

      case 'array':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key} className="text-sm font-medium">
              {displayName}
              {setting.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={setting.key}
              value={JSON.stringify(value, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  handleInputChange(setting.key, parsed)
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              placeholder={setting.description}
              rows={8}
              className="font-mono text-sm"
            />
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )

      case 'object':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key} className="text-sm font-medium">
              {displayName}
              {setting.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={setting.key}
              value={JSON.stringify(value, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  handleInputChange(setting.key, parsed)
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              placeholder={setting.description}
              rows={6}
              className="font-mono text-sm"
            />
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )

      default: // string
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key} className="text-sm font-medium">
              {displayName}
              {setting.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {setting.key === 'operating_hours' || setting.key.includes('address') ? (
              <Textarea
                id={setting.key}
                value={String(value) || ''}
                onChange={(e) => handleInputChange(setting.key, e.target.value)}
                placeholder={setting.description}
                rows={3}
              />
            ) : (
              <Input
                id={setting.key}
                type={setting.key.includes('email') ? 'email' :
                      setting.key.includes('url') ? 'url' :
                      setting.key.includes('phone') ? 'tel' : 'text'}
                value={String(value) || ''}
                onChange={(e) => handleInputChange(setting.key, e.target.value)}
                placeholder={setting.description}
                className={setting.key.includes('email') || setting.key.includes('phone') ? 'max-w-sm' : ''}
              />
            )}
            {setting.description && (
              <p className="text-sm text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )
    }
  }

  const getTabIcon = (category: string) => {
    switch (category) {
      case 'business_rules': return <IconSettings className="w-4 h-4" />
      case 'business_info': return <IconBuildingStore className="w-4 h-4" />
      case 'ui_settings': return <IconPalette className="w-4 h-4" />
      case 'validation': return <IconShield className="w-4 h-4" />
      case 'communication': return <IconMessage className="w-4 h-4" />
      case 'content': return <IconFileText className="w-4 h-4" />
      case 'formatting': return <IconGlobe className="w-4 h-4" />
      default: return <IconSettings className="w-4 h-4" />
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Paramètres Administrateur</h1>
            <p className="text-muted-foreground mt-2">
              Configurez tous les aspects de votre application
            </p>
          </div>
        </div>
        <div className="text-center py-12">
          <IconLoader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement des paramètres...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Paramètres Administrateur</h1>
          <p className="text-muted-foreground mt-2">
            Configurez tous les aspects de votre application
          </p>
        </div>
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
            size="sm"
            className="w-full sm:w-auto"
          >
            {exporting ? (
              <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <IconDownload className="w-4 h-4 mr-2" />
            )}
            <span className="sm:inline">Exporter</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetting}
            size="sm"
            className="w-full sm:w-auto"
          >
            {resetting ? (
              <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <IconRefresh className="w-4 h-4 mr-2" />
            )}
            <span className="sm:inline">Réinitialiser</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            size="sm"
            className="w-full sm:w-auto"
          >
            {saving ? (
              <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <IconDeviceFloppy className="w-4 h-4 mr-2" />
            )}
            <span className="sm:inline">Sauvegarder</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasChanges && (
        <Alert>
          <AlertDescription>
            Vous avez des modifications non sauvegardées. N'oubliez pas de sauvegarder vos changements.
          </AlertDescription>
        </Alert>
      )}

      {/* Settings Tabs */}
      <Tabs defaultValue={settingsGroups[0]?.category} className="space-y-6">
        {/* Mobile: horizontally scrollable strip with visible labels.
            Desktop: the original 7-column grid. */}
        <TabsList className="flex w-full h-auto justify-start gap-1 overflow-x-auto lg:grid lg:grid-cols-7">
          {settingsGroups.map((group) => (
            <TabsTrigger
              key={group.category}
              value={group.category}
              className="flex shrink-0 items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2.5 min-h-[44px] lg:min-w-0"
            >
              {getTabIcon(group.category)}
              <span className="lg:truncate">
                {SettingsService.getCategoryDisplayName(group.category)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {settingsGroups.map((group) => (
          <TabsContent key={group.category} value={group.category}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {getTabIcon(group.category)}
                  <span>{SettingsService.getCategoryDisplayName(group.category)}</span>
                </CardTitle>
                <CardDescription>
                  Configurez les paramètres de {SettingsService.getCategoryDisplayName(group.category).toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6">
                  {group.settings.map((setting, index) => (
                    <div key={setting.key} className="space-y-4">
                      {renderSettingInput(setting)}
                      {index < group.settings.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
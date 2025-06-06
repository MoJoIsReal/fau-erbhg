import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Users, Settings as SettingsIcon } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { BoardMember } from '@shared/schema';

interface BoardMemberFormData {
  name: string;
  role: string;
  email: string;
  phone: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<BoardMember | null>(null);
  const [formData, setFormData] = useState<BoardMemberFormData>({
    name: '',
    role: '',
    email: '',
    phone: '',
    description: '',
    displayOrder: 0,
    isActive: true
  });

  // Fetch board members
  const { data: boardMembers = [], isLoading } = useQuery<BoardMember[]>({
    queryKey: ['/api/secure-documents/board-members'],
    enabled: isAuthenticated,
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/secure-documents/board-members', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch board members');
      return response.json();
    }
  });

  // Add board member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (data: BoardMemberFormData) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/secure-documents/board-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to add member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/secure-documents/board-members'] });
      setIsAddModalOpen(false);
      resetForm();
      toast({
        title: language === 'no' ? 'Medlem lagt til' : 'Member added',
        description: language === 'no' ? 'Styremedlem er lagt til' : 'Board member has been added'
      });
    },
    onError: () => {
      toast({
        title: language === 'no' ? 'Feil' : 'Error',
        description: language === 'no' ? 'Kunne ikke legge til medlem' : 'Could not add member',
        variant: 'destructive'
      });
    }
  });

  // Update board member mutation
  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: BoardMemberFormData }) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/secure-documents/board-members?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/secure-documents/board-members'] });
      setEditingMember(null);
      resetForm();
      toast({
        title: language === 'no' ? 'Medlem oppdatert' : 'Member updated',
        description: language === 'no' ? 'Styremedlem er oppdatert' : 'Board member has been updated'
      });
    },
    onError: () => {
      toast({
        title: language === 'no' ? 'Feil' : 'Error',
        description: language === 'no' ? 'Kunne ikke oppdatere medlem' : 'Could not update member',
        variant: 'destructive'
      });
    }
  });

  // Delete board member mutation
  const deleteMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/secure-documents/board-members?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to delete member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/secure-documents/board-members'] });
      toast({
        title: language === 'no' ? 'Medlem slettet' : 'Member deleted',
        description: language === 'no' ? 'Styremedlem er slettet' : 'Board member has been deleted'
      });
    },
    onError: () => {
      toast({
        title: language === 'no' ? 'Feil' : 'Error',
        description: language === 'no' ? 'Kunne ikke slette medlem' : 'Could not delete member',
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      role: '',
      email: '',
      phone: '',
      description: '',
      displayOrder: 0,
      isActive: true
    });
  };

  const handleEdit = (member: BoardMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      role: member.role,
      email: member.email || '',
      phone: member.phone || '',
      description: member.description || '',
      displayOrder: member.displayOrder || 0,
      isActive: member.isActive ?? true
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.role.trim()) {
      toast({
        title: language === 'no' ? 'Feil' : 'Error',
        description: language === 'no' ? 'Navn og rolle er påkrevd' : 'Name and role are required',
        variant: 'destructive'
      });
      return;
    }

    if (editingMember) {
      updateMemberMutation.mutate({ id: editingMember.id, data: formData });
    } else {
      addMemberMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm(language === 'no' ? 'Er du sikker på at du vil slette dette styremedlemmet?' : 'Are you sure you want to delete this board member?')) {
      deleteMemberMutation.mutate(id);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">
            {language === 'no' ? 'Ingen tilgang' : 'Access Denied'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'no' ? 'Du må være innlogget for å se denne siden' : 'You must be logged in to view this page'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <SettingsIcon className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold">
                {language === 'no' ? 'Innstillinger' : 'Settings'}
              </h1>
              <p className="text-muted-foreground">
                {language === 'no' ? 'Administrer FAU-styret og andre innstillinger' : 'Manage FAU board members and other settings'}
              </p>
            </div>
          </div>
        </div>

        {/* Board Members Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <CardTitle>
                  {language === 'no' ? 'FAU-styret' : 'FAU Board Members'}
                </CardTitle>
              </div>
              <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    {language === 'no' ? 'Legg til medlem' : 'Add Member'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {language === 'no' ? 'Legg til styremedlem' : 'Add Board Member'}
                    </DialogTitle>
                    <DialogDescription>
                      {language === 'no' ? 'Legg til et nytt medlem i FAU-styret' : 'Add a new member to the FAU board'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">{language === 'no' ? 'Navn *' : 'Name *'}</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={language === 'no' ? 'Fullt navn' : 'Full name'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">{language === 'no' ? 'Rolle *' : 'Role *'}</Label>
                      <Input
                        id="role"
                        value={formData.role}
                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                        placeholder={language === 'no' ? 'f.eks. Leder, Nestleder' : 'e.g. Chairman, Vice-chairman'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">{language === 'no' ? 'E-post' : 'Email'}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">{language === 'no' ? 'Telefon' : 'Phone'}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+47 123 45 678"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">{language === 'no' ? 'Beskrivelse' : 'Description'}</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={language === 'no' ? 'Kort beskrivelse av medlemmet' : 'Brief description of the member'}
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="displayOrder">{language === 'no' ? 'Visningsrekkefølge' : 'Display Order'}</Label>
                      <Input
                        id="displayOrder"
                        type="number"
                        value={formData.displayOrder}
                        onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                      />
                      <Label htmlFor="isActive">{language === 'no' ? 'Aktiv' : 'Active'}</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                      {language === 'no' ? 'Avbryt' : 'Cancel'}
                    </Button>
                    <Button 
                      onClick={handleSubmit}
                      disabled={addMemberMutation.isPending}
                    >
                      {addMemberMutation.isPending 
                        ? (language === 'no' ? 'Legger til...' : 'Adding...') 
                        : (language === 'no' ? 'Legg til' : 'Add')
                      }
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>
              {language === 'no' 
                ? 'Administrer medlemmene i FAU-styret som vises på hovedsiden' 
                : 'Manage the FAU board members displayed on the main site'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : boardMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {language === 'no' ? 'Ingen styremedlemmer funnet' : 'No board members found'}
              </div>
            ) : (
              <div className="space-y-4">
                {(boardMembers as BoardMember[]).map((member: BoardMember) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold">{member.name}</h3>
                        <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {member.role}
                        </span>
                        {!member.isActive && (
                          <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded">
                            {language === 'no' ? 'Inaktiv' : 'Inactive'}
                          </span>
                        )}
                      </div>
                      {member.description && (
                        <p className="text-sm text-muted-foreground mt-1">{member.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                        {member.email && <span>{member.email}</span>}
                        {member.phone && <span>{member.phone}</span>}
                        <span>{language === 'no' ? 'Rekkefølge' : 'Order'}: {member.displayOrder}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(member)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(member.id)}
                        disabled={deleteMemberMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Modal */}
        <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {language === 'no' ? 'Rediger styremedlem' : 'Edit Board Member'}
              </DialogTitle>
              <DialogDescription>
                {language === 'no' ? 'Oppdater informasjon om styremedlemmet' : 'Update the board member information'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">{language === 'no' ? 'Navn *' : 'Name *'}</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={language === 'no' ? 'Fullt navn' : 'Full name'}
                />
              </div>
              <div>
                <Label htmlFor="edit-role">{language === 'no' ? 'Rolle *' : 'Role *'}</Label>
                <Input
                  id="edit-role"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  placeholder={language === 'no' ? 'f.eks. Leder, Nestleder' : 'e.g. Chairman, Vice-chairman'}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">{language === 'no' ? 'E-post' : 'Email'}</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">{language === 'no' ? 'Telefon' : 'Phone'}</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+47 123 45 678"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">{language === 'no' ? 'Beskrivelse' : 'Description'}</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={language === 'no' ? 'Kort beskrivelse av medlemmet' : 'Brief description of the member'}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-displayOrder">{language === 'no' ? 'Visningsrekkefølge' : 'Display Order'}</Label>
                <Input
                  id="edit-displayOrder"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="edit-isActive">{language === 'no' ? 'Aktiv' : 'Active'}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMember(null)}>
                {language === 'no' ? 'Avbryt' : 'Cancel'}
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={updateMemberMutation.isPending}
              >
                {updateMemberMutation.isPending 
                  ? (language === 'no' ? 'Oppdaterer...' : 'Updating...') 
                  : (language === 'no' ? 'Oppdater' : 'Update')
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
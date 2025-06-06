import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Settings as SettingsIcon, AlertCircle } from 'lucide-react';

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const { language } = useLanguage();

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
                {language === 'no' ? 'Administrer FAU-siden og innstillinger' : 'Manage FAU site and settings'}
              </p>
            </div>
          </div>
        </div>

        {/* Vercel Function Limit Notice */}
        <Card className="mb-8 border-orange-200 bg-orange-50">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-800">
                {language === 'no' ? 'Viktig informasjon' : 'Important Information'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-orange-800">
              {language === 'no'
                ? 'Dette nettstedet kjører på Vercel Hobby-plan som begrenser oss til 12 serverless funksjoner. Alle kritiske funksjoner fungerer, men avanserte administrasjonsfunksjoner er begrenset for å holde siden innenfor grensene.'
                : 'This website runs on Vercel Hobby plan which limits us to 12 serverless functions. All critical features work, but advanced administration functions are limited to keep the site within constraints.'
              }
            </p>
          </CardContent>
        </Card>

        {/* Board Members Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <CardTitle>
                {language === 'no' ? 'FAU-styret' : 'FAU Board Members'}
              </CardTitle>
            </div>
            <CardDescription>
              {language === 'no' 
                ? 'Styremedlemmer vises på hovedsiden' 
                : 'Board members are displayed on the home page'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="mb-4">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <h3 className="text-lg font-semibold mb-2">
                  {language === 'no' ? 'Styremedlemmer administrasjon' : 'Board Members Administration'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {language === 'no' 
                    ? 'Styremedlemmer vises på hovedsiden. For å endre disse, kontakt teknisk support eller oppgrader til Pro-plan for full administrasjon.' 
                    : 'Board members are displayed on the home page. To modify these, contact technical support or upgrade to Pro plan for full administration.'
                  }
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  {language === 'no'
                    ? 'Begrensning: Vercel Hobby-plan tillater kun 12 serverless funksjoner. Full styremedlem-administrasjon krever flere API-endepunkter.'
                    : 'Limitation: Vercel Hobby plan allows only 12 serverless functions. Full board member administration requires additional API endpoints.'
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Features Status */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>
              {language === 'no' ? 'Funksjonsstatus' : 'Feature Status'}
            </CardTitle>
            <CardDescription>
              {language === 'no' 
                ? 'Oversikt over tilgjengelige funksjoner' 
                : 'Overview of available features'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200">
                <div>
                  <h4 className="font-medium text-green-800">{language === 'no' ? 'Arrangement administrasjon' : 'Event Management'}</h4>
                  <p className="text-sm text-green-700">
                    {language === 'no' ? 'Opprett, rediger og administrer arrangementer' : 'Create, edit and manage events'}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  {language === 'no' ? 'Aktiv' : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200">
                <div>
                  <h4 className="font-medium text-green-800">{language === 'no' ? 'Dokument administrasjon' : 'Document Management'}</h4>
                  <p className="text-sm text-green-700">
                    {language === 'no' ? 'Last opp og administrer dokumenter' : 'Upload and manage documents'}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  {language === 'no' ? 'Aktiv' : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200">
                <div>
                  <h4 className="font-medium text-green-800">{language === 'no' ? 'Vigilo integrasjon' : 'Vigilo Integration'}</h4>
                  <p className="text-sm text-green-700">
                    {language === 'no' ? 'Ekstern påmelding via Vigilo-plattformen' : 'External registration via Vigilo platform'}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  {language === 'no' ? 'Aktiv' : 'Active'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Future Features */}
        <Card>
          <CardHeader>
            <CardTitle>
              {language === 'no' ? 'Fremtidige funksjoner' : 'Future Features'}
            </CardTitle>
            <CardDescription>
              {language === 'no' 
                ? 'Disse funksjonene vil være tilgjengelige med Pro-plan' 
                : 'These features will be available with Pro plan'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
                <div>
                  <h4 className="font-medium">{language === 'no' ? 'Styremedlem administrasjon' : 'Board Member Management'}</h4>
                  <p className="text-sm text-muted-foreground">
                    {language === 'no' ? 'Full administrasjon av styremedlemmer' : 'Full administration of board members'}
                  </p>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {language === 'no' ? 'Pro-plan' : 'Pro Plan'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
                <div>
                  <h4 className="font-medium">{language === 'no' ? 'E-post innstillinger' : 'Email Settings'}</h4>
                  <p className="text-sm text-muted-foreground">
                    {language === 'no' ? 'Konfigurer e-post maler og varsler' : 'Configure email templates and notifications'}
                  </p>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {language === 'no' ? 'Pro-plan' : 'Pro Plan'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
                <div>
                  <h4 className="font-medium">{language === 'no' ? 'Brukeradministrasjon' : 'User Management'}</h4>
                  <p className="text-sm text-muted-foreground">
                    {language === 'no' ? 'Administrer brukerroller og tilganger' : 'Manage user roles and permissions'}
                  </p>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {language === 'no' ? 'Pro-plan' : 'Pro Plan'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
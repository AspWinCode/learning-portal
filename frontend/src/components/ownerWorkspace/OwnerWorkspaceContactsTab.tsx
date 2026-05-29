import React from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

import type { OwnerWorkspaceContact, OwnerWorkspaceProject } from '../../types';

type OwnerWorkspaceContactsTabProps = {
  contacts: OwnerWorkspaceContact[];
  projectsCatalogSorted: OwnerWorkspaceProject[];
  contactListTagOptions: string[];
  contactListSearchInput: string;
  contactListProjectId: number | '';
  contactListTag: string;
  contactListActiveTasksOnly: boolean;
  contactName: string;
  contactPhone: string;
  newContactProjectId: number | '';
  canCreateContactUi: boolean;
  isWorkspaceFullAccess: boolean;
  onContactListSearchInputChange: (value: string) => void;
  onContactListProjectIdChange: (value: number | '') => void;
  onContactListTagChange: (value: string) => void;
  onContactListActiveTasksOnlyChange: (value: boolean) => void;
  onContactNameChange: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
  onNewContactProjectIdChange: (value: number | '') => void;
  onCreateContact: () => void | Promise<void>;
  onOpenContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onOpenContactComms: (contactId: number) => void | Promise<void>;
  onOpenContactTasks: (contactId: number) => void | Promise<void>;
};

export function OwnerWorkspaceContactsTab({
  contacts,
  projectsCatalogSorted,
  contactListTagOptions,
  contactListSearchInput,
  contactListProjectId,
  contactListTag,
  contactListActiveTasksOnly,
  contactName,
  contactPhone,
  newContactProjectId,
  canCreateContactUi,
  isWorkspaceFullAccess,
  onContactListSearchInputChange,
  onContactListProjectIdChange,
  onContactListTagChange,
  onContactListActiveTasksOnlyChange,
  onContactNameChange,
  onContactPhoneChange,
  onNewContactProjectIdChange,
  onCreateContact,
  onOpenContact,
  onOpenContactComms,
  onOpenContactTasks,
}: OwnerWorkspaceContactsTabProps) {
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="subtitle2" gutterBottom>
            Р¤РёР»СЊС‚СЂС‹ СЃРїРёСЃРєР° РєРѕРЅС‚Р°РєС‚РѕРІ
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
            <TextField
              label="РџРѕРёСЃРє (Р¤РРћ, С‚РµР»РµС„РѕРЅ, РєРѕРјРїР°РЅРёСЏ)"
              size="small"
              sx={{ minWidth: 240, flex: 1 }}
              value={contactListSearchInput}
              onChange={(e) => onContactListSearchInputChange(e.target.value)}
            />
            <TextField
              select
              label="Р’ РїСЂРѕРµРєС‚Рµ"
              size="small"
              sx={{ minWidth: 220 }}
              value={contactListProjectId === '' ? '' : String(contactListProjectId)}
              onChange={(e) => {
                const value = e.target.value;
                onContactListProjectIdChange(value === '' ? '' : Number(value));
              }}
            >
              <MenuItem value="">Р›СЋР±РѕР№</MenuItem>
              {projectsCatalogSorted.map((project) => (
                <MenuItem key={project.id} value={String(project.id)}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="РўРµРі"
              size="small"
              sx={{ minWidth: 180 }}
              value={contactListTag}
              onChange={(e) => onContactListTagChange(e.target.value)}
              helperText={contactListTagOptions.length === 0 ? 'РќРµС‚ С‚РµРіРѕРІ РІ РєР°С‚Р°Р»РѕРіРµ' : undefined}
            >
              <MenuItem value="">Р›СЋР±РѕР№</MenuItem>
              {contactListTagOptions.map((tag) => (
                <MenuItem key={tag} value={tag}>
                  {tag}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Checkbox
                  checked={contactListActiveTasksOnly}
                  onChange={(_, checked) => onContactListActiveTasksOnlyChange(checked)}
                />
              }
              label="РўРѕР»СЊРєРѕ СЃ Р°РєС‚РёРІРЅС‹РјРё Р·Р°РґР°С‡Р°РјРё"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
            <TextField fullWidth label="Р¤РРћ" value={contactName} onChange={(e) => onContactNameChange(e.target.value)} />
            <TextField fullWidth label="РўРµР»РµС„РѕРЅ" value={contactPhone} onChange={(e) => onContactPhoneChange(e.target.value)} />
            {!isWorkspaceFullAccess && (
              <Autocomplete
                sx={{ minWidth: 260, flex: 1 }}
                options={projectsCatalogSorted}
                getOptionLabel={(option) => option.name}
                value={projectsCatalogSorted.find((project) => project.id === newContactProjectId) || null}
                onChange={(_, value) => onNewContactProjectIdChange(value ? value.id : '')}
                renderInput={(params) => <TextField {...params} label="РџСЂРѕРµРєС‚ РґР»СЏ РїСЂРёРІСЏР·РєРё" />}
              />
            )}
            <Button
              variant="contained"
              onClick={() => void onCreateContact()}
              disabled={!canCreateContactUi || (!isWorkspaceFullAccess && newContactProjectId === '')}
            >
              РЎРѕР·РґР°С‚СЊ
            </Button>
          </Stack>
          {!isWorkspaceFullAccess && !canCreateContactUi && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              РЎРѕР·РґР°РЅРёРµ РєРѕРЅС‚Р°РєС‚РѕРІ РґР»СЏ РѕРіСЂР°РЅРёС‡РµРЅРЅС‹С… СЂРѕР»РµР№ СЃРµР№С‡Р°СЃ РѕС‚РєР»СЋС‡РµРЅРѕ policy-РјРѕРґРµР»СЊСЋ.
            </Alert>
          )}
          {!isWorkspaceFullAccess && canCreateContactUi && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Р”Р»СЏ sales / trainer РЅРѕРІС‹Р№ РєРѕРЅС‚Р°РєС‚ СЃРѕР·РґР°С‘С‚СЃСЏ С‚РѕР»СЊРєРѕ РІРјРµСЃС‚Рµ СЃ РїСЂРёРІСЏР·РєРѕР№ Рє РґРѕСЃС‚СѓРїРЅРѕРјСѓ РїСЂРѕРµРєС‚Сѓ.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {contacts.map((contact) => (
          <Grid item xs={12} md={6} key={contact.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h6">{contact.full_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {contact.phone}
                    </Typography>
                    {contact.company?.trim() ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {contact.company}
                      </Typography>
                    ) : null}
                    {(contact.tags?.length ?? 0) > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1, gap: 0.5 }}>
                        {(contact.tags ?? []).slice(0, 5).map((tag, index) => (
                          <Chip key={`${tag}-${index}`} size="small" variant="outlined" label={tag} />
                        ))}
                        {(contact.tags ?? []).length > 5 ? (
                          <Chip size="small" variant="outlined" label={`+${(contact.tags ?? []).length - 5}`} />
                        ) : null}
                      </Stack>
                    ) : null}
                    {contact.last_interaction_at ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                        РџРѕСЃР»РµРґРЅРµРµ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРёРµ:{' '}
                        {new Date(contact.last_interaction_at).toLocaleString('ru-RU', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Typography>
                    ) : null}
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip size="small" label={`РђРєС‚РёРІРЅ. Р·Р°РґР°С‡: ${contact.active_tasks_count}`} />
                      {contact.linked_project_ids.length > 0 && (
                        <Chip size="small" label={`РџСЂРѕРµРєС‚РѕРІ: ${contact.linked_project_ids.length}`} />
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.25} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                    <Tooltip title="РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р°">
                      <IconButton size="small" onClick={() => void onOpenContact(contact)} aria-label="РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р°">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="РџРµСЂРµРїРёСЃРєР°">
                      <IconButton
                        size="small"
                        onClick={() => void onOpenContactComms(contact.id)}
                        aria-label="РћС‚РєСЂС‹С‚СЊ РїРµСЂРµРїРёСЃРєСѓ"
                      >
                        <ChatBubbleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Р—Р°РґР°С‡Рё РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ">
                      <IconButton
                        size="small"
                        onClick={() => void onOpenContactTasks(contact.id)}
                        aria-label="Р—Р°РґР°С‡Рё РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ"
                      >
                        <AssignmentIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {contact.phone?.trim() ? (
                      <Tooltip title="РџРѕР·РІРѕРЅРёС‚СЊ">
                        <IconButton
                          size="small"
                          component="a"
                          href={`tel:${contact.phone.replace(/\\s/g, '')}`}
                          aria-label="РџРѕР·РІРѕРЅРёС‚СЊ"
                          rel="noopener noreferrer"
                        >
                          <PhoneIphoneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {contacts.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">
              РќРµС‚ РєРѕРЅС‚Р°РєС‚РѕРІ РїРѕ С‚РµРєСѓС‰РёРј С„РёР»СЊС‚СЂР°Рј.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
}

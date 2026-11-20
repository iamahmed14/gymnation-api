import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { COUNTRY_CODES, NAME_MAX_LENGTH } from '../config';
import { AppError, notFound, validationError } from '../errors';
import { normalizeForCreate, normalizeForLookup } from '../logic/phone';
import { store } from '../store';
import { Member } from '../types';
import { asObject, requireOneOf, requireString } from '../utils/validate';

// POST /members
export function createMember(req: Request, res: Response) {
  const body = asObject(req.body);
  const name = requireString(body, 'name').trim();
  const country = requireOneOf(body, 'country', COUNTRY_CODES);
  const rawPhone = requireString(body, 'phone');

  const nameLength = [...name].length; // count characters, not UTF-16 units (emoji = 1)
  if (nameLength < 1 || nameLength > NAME_MAX_LENGTH) {
    throw validationError(`name must be 1-${NAME_MAX_LENGTH} characters`);
  }

  const phone = normalizeForCreate(rawPhone, country);

  // check + write happen synchronously, so two racing requests can't both pass this check
  const existingId = store.memberIdByPhone.get(phone);
  if (existingId) {
    throw new AppError(409, 'PHONE_TAKEN', 'Another member already has this phone', { existing_member_id: existingId });
  }

  const member: Member = { id: randomUUID(), name, country, phone };
  store.members.set(member.id, member);
  store.memberIdByPhone.set(phone, member.id);

  res.status(201).json(member);
}

// GET /members/lookup?phone=...&country=...
export function lookupMember(req: Request, res: Response) {
  const query = asObject(req.query, 'Query');
  const rawPhone = requireString(query, 'phone');
  const country = query.country === undefined ? undefined : requireOneOf(query, 'country', COUNTRY_CODES);

  const phone = normalizeForLookup(rawPhone, country);

  const memberId = store.memberIdByPhone.get(phone);
  if (!memberId) throw notFound('No member has this phone');

  res.status(200).json(store.members.get(memberId));
}

import { z } from 'zod/v4';
import { jsonSchema } from 'ai';

const departmentIds = [
	'visitor_relations',
	'official_events',
	'corporate_relations',
	'media_relations',
	'local_relations',
	'lost_and_found',
	'security',
	'network',
	'other'
];

export type RequestType = {
	name: string;
	email: string;
	company_or_group_name?: string;
	body: string;
};

export const responseSchema = jsonSchema<{
	department: string;
}>({
	type: 'object',
	properties: {
		department: {
			type: 'string',
			enum: departmentIds
		}
	},
	required: [
		'department',
	],
	additionalProperties: false
});

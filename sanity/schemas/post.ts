import { defineField, defineType } from 'sanity';

export const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required().max(160),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title', maxLength: 80 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'excerpt',
      type: 'text',
      rows: 3,
      description: 'One-paragraph summary shown on listing pages.',
      validation: (r) => r.max(300),
    }),
    defineField({
      name: 'category',
      type: 'reference',
      to: [{ type: 'category' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'authorName',
      title: 'Author name',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'authorRole',
      title: 'Author role',
      type: 'string',
      description: 'e.g. "Founder" — shown next to read time on featured posts.',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'readingMinutes',
      title: 'Reading time (minutes)',
      type: 'number',
      validation: (r) => r.min(1).max(60),
    }),
    defineField({
      name: 'featured',
      title: 'Featured post',
      type: 'boolean',
      description:
        'Promotes this post into the large editor-pick slot at the top of the journal. Only one post should be featured at a time — the newest featured wins.',
      initialValue: false,
    }),
    defineField({
      name: 'coverColor',
      title: 'Cover color',
      type: 'string',
      description: 'Background tint for the generated cover art.',
      options: {
        list: [
          { title: 'Forest (dark)', value: 'forest' },
          { title: 'Moss (brand green)', value: 'moss' },
          { title: 'Sage (light green)', value: 'sage' },
          { title: 'Gold', value: 'gold' },
          { title: 'Blue', value: 'blue' },
          { title: 'Ink (near-black)', value: 'ink' },
        ],
        layout: 'radio',
      },
      initialValue: 'forest',
    }),
    defineField({
      name: 'coverShape',
      title: 'Cover shape',
      type: 'string',
      description: 'Geometric mark drawn on the cover tile.',
      options: {
        list: [
          { title: 'Circle (light)', value: 'circle' },
          { title: 'Diamond (foundation)', value: 'diamond' },
          { title: 'Two circles (dialogue)', value: 'two-circles' },
          { title: 'Concentric circles (focus)', value: 'concentric' },
          { title: 'Tower (structure)', value: 'tower' },
          { title: 'Circle + diamond (combined)', value: 'combined' },
        ],
        layout: 'radio',
      },
      initialValue: 'combined',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        {
          type: 'block',
          marks: {
            decorators: [
              { title: 'Strong', value: 'strong' },
              { title: 'Emphasis', value: 'em' },
              { title: 'Code', value: 'code' },
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  { name: 'href', type: 'url', title: 'URL' },
                ],
              },
            ],
          },
        },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', type: 'string', title: 'Alt text' },
            { name: 'caption', type: 'string', title: 'Caption' },
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      author: 'authorName',
      date: 'publishedAt',
    },
    prepare({ title, author, date }) {
      const d = date
        ? new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '';
      return {
        title: title || 'Untitled',
        subtitle: [author, d].filter(Boolean).join(' · '),
      };
    },
  },
  orderings: [
    {
      title: 'Published date (newest)',
      name: 'publishedDesc',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
});

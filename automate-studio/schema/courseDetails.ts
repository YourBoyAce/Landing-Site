import {defineType, defineField} from 'sanity'
import {ProductSelectorInput} from '../components/ProductSelectorInput'

export default defineType({
  name: 'courseDetails',
  title: 'Course Details',
  type: 'document',

  fields: [
    /* ---------------- HERO ---------------- */

    defineField({
      name: 'title',
      title: 'Course Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'useExistingProduct',
      title: 'Link to Learning Portal Course',
      type: 'boolean',
      initialValue: false,
    }),

    defineField({
      name: 'productUuid',
      title: 'Linked Course',
      type: 'string',
      hidden: ({parent}) => !parent?.useExistingProduct,
      components: {
        input: ProductSelectorInput,
      },
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
    }),

    defineField({
      name: 'hoverDetails',
      title: 'Hover/Popup Details (Pointers)',
      description:
        'Key pointers that appear in the popup card when hovering over the course.',
      type: 'array',
      of: [{type: 'string'}],
    }),

    defineField({
      name: 'heroImage',
      title: 'Hero Image / Logo',
      type: 'image',
    }),

    defineField({
      name: 'instructorName',
      title: 'Instructor Name',
      type: 'string',
    }),

    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 1,
    }),

    /* ---------------- KEY CONCEPTS ---------------- */

    defineField({
      name: 'keyConcepts',
      title: 'Key Concepts',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'title', type: 'string', title: 'Title'},
            {name: 'icon', type: 'image', title: 'Icon'},
            {name: 'description', type: 'string', title: 'Description'},
          ],
        },
      ],
    }),

    /* ---------------- DESCRIPTION ---------------- */

    defineField({
      name: 'description',
      title: 'Course Description',
      type: 'array',
      of: [{type: 'block'}],
    }),

    /* ---------------- ENROLL / DURATION ---------------- */

    defineField({
      name: 'duration',
      title: 'Duration (e.g. 6 Weeks)',
      type: 'string',
    }),

    /* ---------------- WHO FOR ---------------- */

    defineField({
      name: 'whoFor',
      title: 'Who is this course for?',
      type: 'array',
      of: [{type: 'string'}],
    }),

    /* ---------------- WHAT YOU LEARN ---------------- */

    defineField({
      name: 'curriculum',
      title: "What You'll Learn (Curriculum)",
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'module',
          fields: [
            {name: 'subheading', title: 'Subheading (e.g. Tosca Fundamentals)', type: 'string'},
            {
              name: 'points',
              title: 'Major Points',
              type: 'array',
              of: [{type: 'string'}],
            },
            {name: 'summary', title: 'Module Summary (Short Footer Text)', type: 'string'},
          ],
        },
      ],
    }),

    /* ---------------- OUTCOMES ---------------- */

    defineField({
      name: 'outcomes',
      title: 'Outcomes',
      type: 'array',
      of: [{type: 'string'}],
    }),

    /* ---------------- HIGHLIGHTS ---------------- */

    defineField({
      name: 'highlights',
      title: 'Course Highlights',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'icon', type: 'image', title: 'Icon'},
            {name: 'title', type: 'string', title: 'Title'},
          ],
        },
      ],
    }),

    /* ---------------- STATS ---------------- */

    defineField({
      name: 'hours',
      title: 'Total Hours',
      type: 'number',
    }),

    defineField({
      name: 'students',
      title: 'Students Enrolled',
      type: 'number',
    }),

    defineField({
      name: 'projects',
      title: 'Projects Count',
      type: 'number',
    }),
  ],
})

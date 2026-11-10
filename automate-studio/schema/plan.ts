import { defineField, defineType } from "sanity";

export default defineType({
    name: "plan",
    title: "Course Plan",
    type: "document",

    fields: [
        defineField({
            name: "bundleUuid",
            title: "Supabase Bundle UUID",
            type: "string",
            description: "The UUID of the bundle in Supabase (e.g., for Pro, Starter, etc.)",
        }),
        defineField({
            name: "title",
            title: "Plan Title",
            type: "string",
            validation: Rule => Rule.required(),
        }),

        defineField({
            name: "badge",
            title: "Badge",
            type: "string",
            options: {
                list: [
                    { title: "Starter", value: "Starter" },
                    { title: "Pro", value: "Pro" },
                    { title: "Premium", value: "Premium" },
                ],
            },
            validation: Rule => Rule.required(),
        }),

        defineField({
            name: "price",
            title: "Price",
            type: "number",
            validation: Rule => Rule.required().min(0),
        }),

        defineField({
            name: "coverImage",
            title: "Cover Image",
            type: "image",
            options: {
                hotspot: true,
            },
        }),

        defineField({
            name: "rating",
            title: "Rating",
            type: "number",
            initialValue: 5,
        }),

        defineField({
            name: "reviewCount",
            title: "Review Count",
            type: "number",
            initialValue: 0,
        }),

        defineField({
            name: "duration",
            title: "Duration",
            type: "string",
            initialValue: "1 month",
        }),

        defineField({
            name: "features",
            title: "Features",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({
                            name: "title",
                            title: "Feature",
                            type: "string",
                        }),

                        defineField({
                            name: "included",
                            title: "Included",
                            type: "boolean",
                            initialValue: true,
                        }),
                    ],
                    preview: {
                        select: {
                            title: "title",
                            included: "included",
                        },
                        prepare({ title, included }) {
                            return {
                                title,
                                subtitle: included ? "Included" : "Not Included",
                            };
                        },
                    },
                },
            ],
        }),

        defineField({
            name: "displayOrder",
            title: "Display Order",
            type: "number",
            initialValue: 1,
        }),

        defineField({
            name: "active",
            title: "Active",
            type: "boolean",
            initialValue: true,
        }),
    ],

    preview: {
        select: {
            title: "title",
            subtitle: "badge",
            media: "coverImage",
        },
    },
});
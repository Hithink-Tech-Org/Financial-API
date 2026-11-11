import { z } from 'zod';

const text = z.string();
const optionalText = text.nullable().optional();
const integer = z.number().int();
const optionalInteger = integer.nullable().optional();
const summaryItem = z.object({ title: text, content: text }).passthrough();
const finding = z
  .object({
    title: text,
    blocks: z.array(z.object({ sub_title: text, content_html: text }).passthrough()),
  })
  .passthrough();

export const newsArticleOutput = z
  .object({
    encoded_seq: text,
    title: text,
    author: text.nullable(),
    summary: text.nullable(),
    content: text,
    source: text.nullable(),
    publish_time_ms: integer,
    is_kuaixun: z.boolean().nullable(),
  })
  .passthrough();

export const newsFlashOutput = z
  .object({
    items: z.array(
      z
        .object({
          id: text,
          seq: text,
          title: text,
          encoded_url: text,
          summary: optionalText,
          tags: z.array(z.object({ id: integer, name: text }).passthrough()),
          type: integer,
          create_time_ms: integer,
          update_time_ms: integer,
          pic_url: optionalText,
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const newsNoticeOutput = z
  .object({
    seq: text,
    guid: optionalText,
    title: text,
    report_period: optionalText,
    summary: z
      .object({ notice_type: text, items: z.array(summaryItem) })
      .passthrough()
      .nullable()
      .optional(),
    monthly_report_interpretation: z
      .object({
        notice_type: text,
        has_findings: z.boolean(),
        findings: z.array(finding),
        summary_html: text,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const newsTopicOutput = z
  .object({
    items: z.array(
      z
        .object({
          id: text,
          title: text,
          cover: optionalText,
          url: text,
          type: optionalText,
          seo_key: optionalText,
          propagation_chain: optionalText,
          important_flag: optionalInteger,
          pinned_flag: optionalInteger,
          pin_label: optionalText,
          source_created_at: optionalText,
          source_updated_at: optionalText,
        })
        .passthrough(),
    ),
    next_cursor: text.nullable(),
    has_more: z.boolean(),
  })
  .passthrough();

export const newsAnomalyOutput = z
  .object({
    items: z.array(
      z
        .object({
          analysis_id: text,
          domain: optionalText,
          analysis_content: optionalText,
          key_word_list: z.array(text).nullable().optional(),
          anomaly_type: optionalText,
          tag_code: optionalText,
          tag_name: optionalText,
          link_url: text,
          create_time: optionalInteger,
          last_anomaly_time: optionalInteger,
          first_publish_time: optionalInteger,
          tag_code_update_time: optionalInteger,
        })
        .passthrough(),
    ),
    was_truncated: z.boolean(),
  })
  .passthrough();

export const newsTimelineOutput = z
  .object({
    items: z.array(
      z
        .object({
          id: text,
          type: optionalInteger,
          title: text,
          author: optionalText,
          source: optionalText,
          summary: optionalText,
          publish_time_ms: optionalInteger,
          jump_url: text,
          pic_url: optionalText,
        })
        .passthrough(),
    ),
    has_more: z.boolean(),
    offset: text,
  })
  .passthrough();

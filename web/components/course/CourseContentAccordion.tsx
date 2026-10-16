"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, PlayCircle, MonitorPlay, HelpCircle, FileText } from "lucide-react";
import { CurriculumModule } from "@/lib/types/course";
import { CourseModule, CourseSection } from "@/lib/services/module.service";

interface CourseContentAccordionProps {
  curriculum: CurriculumModule[];
  modules: CourseModule[];
  dbSections?: CourseSection[];
}

export default function CourseContentAccordion({ curriculum, modules, dbSections }: CourseContentAccordionProps) {
  // Group modules based on DB sections or curriculum points
  const sections: { title: string; lectures: CourseModule[] }[] = [];
  
  if (dbSections && dbSections.length > 0) {
    dbSections.forEach((sec) => {
      const sectionLectures = modules.filter(m => String(m.section_id) === String(sec.id));
      sections.push({
        title: sec.title,
        lectures: sectionLectures,
      });
    });
    
    // Any remaining modules without a section (or invalid section)
    const ungrouped = modules.filter(m => !m.section_id || !dbSections.find(s => String(s.id) === String(m.section_id)));
    if (ungrouped.length > 0) {
      sections.push({
        title: "Additional Modules",
        lectures: ungrouped,
      });
    }
  } else {
    let moduleIndex = 0;
    
    if (curriculum && curriculum.length > 0) {
      curriculum.forEach((section) => {
        const sectionLectures: CourseModule[] = [];
        const numPoints = section.points ? section.points.length : 0;
        
        for (let i = 0; i < Math.max(1, numPoints); i++) {
          if (moduleIndex < modules.length) {
            sectionLectures.push(modules[moduleIndex]);
            moduleIndex++;
          }
        }
        
        if (sectionLectures.length > 0) {
          sections.push({
            title: section.subheading,
            lectures: sectionLectures,
          });
        }
      });
    }
  
    // If there are remaining modules or no curriculum, put them in a final section
    if (moduleIndex < modules.length) {
      const remaining = modules.slice(moduleIndex);
      sections.push({
        title: curriculum && curriculum.length > 0 ? "Additional Modules" : "Course Modules",
        lectures: remaining,
      });
    }
  }

  // Pre-calculate ordered list of all lectures to find the first 5 video modules
  const orderedLectures = sections.flatMap((sec) => sec.lectures);
  const videoModules = orderedLectures.filter(
    (m) => {
      const t = (m.module_type || m.type || "video").toLowerCase();
      return t !== "quiz" && t !== "artifact";
    }
  );
  const previewVideoIds = new Set(videoModules.slice(0, 5).map((m) => m.id));

  const INITIAL_VISIBLE_SECTIONS = 5;
  const [showAllSections, setShowAllSections] = useState(false);
  const [expandedSections, setExpandedSections] = useState<number[]>([0]); // Expand first by default

  const visibleSections = showAllSections || sections.length <= INITIAL_VISIBLE_SECTIONS
    ? sections
    : sections.slice(0, INITIAL_VISIBLE_SECTIONS);
  const hiddenSectionsCount = sections.length - INITIAL_VISIBLE_SECTIONS;

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => 
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const expandAll = () => {
    setShowAllSections(true);
    if (expandedSections.length === sections.length) {
      setExpandedSections([]);
    } else {
      setExpandedSections(sections.map((_, i) => i));
    }
  };

  const totalLength = modules.reduce((acc, mod) => {
    if (!mod.duration) return acc;
    const parts = mod.duration.split(':').map(Number);
    if (parts.length === 3) return acc + parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return acc + parts[0] * 60 + parts[1];
    return acc;
  }, 0);
  
  const formatTotalTime = (seconds: number) => {
    if (seconds === 0) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m total length`;
    return `${m}m total length`;
  };

  const totalTimeStr = formatTotalTime(totalLength);

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4">
        <div className="text-sm font-semibold text-slate-700">
          {sections.length} section{sections.length !== 1 ? 's' : ''} • {modules.length} lecture{modules.length !== 1 ? 's' : ''} {totalTimeStr ? `• ${totalTimeStr}` : ''}
        </div>
        <button 
          onClick={expandAll}
          className="text-brand-blue font-bold text-sm hover:text-brand-dark transition-colors mt-2 sm:mt-0 cursor-pointer"
        >
          {expandedSections.length === sections.length && showAllSections ? "Collapse all sections" : "Expand all sections"}
        </button>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        {visibleSections.map((section, secIndex) => {
          const isExpanded = expandedSections.includes(secIndex);
          const sectionDurationSeconds = section.lectures.reduce((acc, mod) => {
            if (!mod.duration) return acc;
            const parts = mod.duration.split(':').map(Number);
            if (parts.length === 3) return acc + parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return acc + parts[0] * 60 + parts[1];
            return acc;
          }, 0);
          const secMins = Math.ceil(sectionDurationSeconds / 60);
          
          return (
            <div key={secIndex} className={`border-b border-slate-200 last:border-b-0`}>
              {/* Section Header */}
              <button
                onClick={() => toggleSection(secIndex)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500 shrink-0" />
                  )}
                  <h3 className="font-bold text-slate-900 text-[15px]">{section.title}</h3>
                </div>
                <div className="text-sm text-slate-500 hidden sm:block shrink-0">
                  {section.lectures.length} lecture{section.lectures.length !== 1 ? 's' : ''} {secMins > 0 ? `• ${secMins}min` : ''}
                </div>
              </button>

              {/* Lectures List */}
              {isExpanded && (
                <div className="bg-white">
                  {section.lectures.map((lecture, lecIndex) => {
                    const modType = (lecture.module_type || lecture.type || '').toLowerCase();
                    const isQuiz = modType === 'quiz';
                    const isArtifact = modType === 'artifact';
                    const isNonPreviewable = isQuiz || isArtifact;
                    const isPreview = !isNonPreviewable && previewVideoIds.has(lecture.id);
                    const videoIdx = !isNonPreviewable ? videoModules.findIndex((m) => m.id === lecture.id) : -1;
                    
                    return (
                      <div 
                        key={lecture.id}
                        className={`flex items-start sm:items-center justify-between p-3 px-4 ${lecIndex !== 0 ? 'border-t border-slate-100' : ''} hover:bg-slate-50 transition-colors`}
                      >
                        <div className="flex items-start sm:items-center gap-3 max-w-[70%]">
                          {isQuiz ? (
                            <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
                          ) : isArtifact ? (
                            <FileText className="w-4 h-4 text-violet-500 shrink-0 mt-0.5 sm:mt-0" />
                          ) : isPreview ? (
                            <PlayCircle className="w-4 h-4 text-brand-blue fill-brand-blue/20 shrink-0 mt-0.5 sm:mt-0" />
                          ) : (
                            <MonitorPlay className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm ${isPreview ? 'text-black font-bold' : 'text-slate-700'}`}>
                              {lecture.title}
                            </span>
                            {isQuiz && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                                Quiz
                              </span>
                            )}
                            {isArtifact && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200/60">
                                Artifact
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs shrink-0 items-end">
                          {isPreview && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(
                                  new CustomEvent("open-preview", {
                                    detail: { index: videoIdx, videoId: lecture.id },
                                  })
                                );
                              }}
                              className="flex items-center gap-1 text-brand-blue font-bold cursor-pointer hover:text-brand-dark transition-colors"
                            >
                              <PlayCircle className="w-3.5 h-3.5 text-brand-blue fill-brand-blue/20" /> Preview
                            </button>
                          )}
                          {lecture.duration && (
                            <span className="text-slate-500 text-right">
                              {lecture.duration}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sections.length > INITIAL_VISIBLE_SECTIONS && (
        <div className="mt-4 flex justify-center">
          {!showAllSections ? (
            <button
              type="button"
              onClick={() => setShowAllSections(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-300 bg-white font-bold text-sm text-brand-blue shadow-sm hover:bg-slate-50 hover:border-brand-blue hover:shadow transition-all cursor-pointer"
            >
              <span>Show all {sections.length} sections ({hiddenSectionsCount} more)</span>
              <ChevronDown className="w-4 h-4 text-brand-blue" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAllSections(false)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 bg-white font-semibold text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              <span>Show fewer sections</span>
              <ChevronUp className="w-4 h-4 text-slate-500" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

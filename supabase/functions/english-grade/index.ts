import { gradingQuestions, writingRubric } from '../_shared/english-grading-data.js';
import { createGradeHandler } from '../_shared/english-grade-core.js';
Deno.serve(createGradeHandler({questions:gradingQuestions,writingRubric,env:name=>Deno.env.get(name)}));

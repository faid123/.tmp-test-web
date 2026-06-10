using System.Collections.Generic;
using UnityEngine;


[CreateAssetMenu(fileName = "AND Criteria", menuName = "Criteria/Multi/AND")]
public class AndCriteria : MultiCriteria
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData overallFailureData)
	{
		overallFailureData = null;
		bool criteriaPassed = true;

		foreach (Criteria criteria in criteriaList)
		{
			//need to check ALL criteria in case any of them prevents placement
			if (!criteria.Assess(placementData, out CriteriaFailureData failureData))
			{
				if (overallFailureData == null)
					overallFailureData = failureData;
				else
					overallFailureData.CombineWith(failureData);

				criteriaPassed = false;
			}
		}

		if (!criteriaPassed && failureMode == FailureMode.UseOwnActionUponFailure)
			overallFailureData.actionUponFailure = actionUponFailure;

		return criteriaPassed;
	}
}

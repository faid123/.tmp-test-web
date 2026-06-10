using System.Collections.Generic;
using UnityEngine;


public abstract class MultiCriteria : Criteria
{
	public enum FailureMode
	{
		UseCriteriaListActionUponFailure,
		UseOwnActionUponFailure
	}

	public FailureMode failureMode;

	public List<Criteria> criteriaList = new List<Criteria>();
}
